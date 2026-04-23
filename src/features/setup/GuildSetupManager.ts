import {
	Guild,
	PermissionFlagsBits,
	ChannelType,
	CategoryChannel,
	GuildChannel,
	Client,
	TextChannel,
	DiscordAPIError,
	ActionRowBuilder,
	ButtonBuilder,
	EmbedBuilder,
	Embed,
	Message,
} from "discord.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { ISetupConfig, IAdminRoleConfig, ICreatedChannels, IChannelObjects, IEnsureHomebaseResult } from "./setup.types.js";
import { ChannelContent } from "./ChannelContent.js";
import { embedContent } from "@base/constants/embed-content.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";

const { channels } = embedContent.setup;

// What: compose the home base category name, appending the dev suffix
//       when NODE_ENV === "development".
// Who:  autoSetup callers. ensures a dev instance sharing a guild with
//       prod creates a visually distinct category instead of colliding.
// When: once per autoSetup call. evaluated at runtime, not module load,
//       so env changes between runs are respected.
// Where: embed-content.ts owns the base name and suffix string. this
//        helper owns the env branching so the constants file stays free
//        of environment logic.
// How:   plain string concat. devSuffix is an empty string in prod or any
//        non-development value, so we could always concat, but the env
//        check keeps the production name pristine.
function resolveCategoryName(): string {
	return process.env.NODE_ENV === "development"
		? embedContent.setup.categoryName + embedContent.setup.devSuffix
		: embedContent.setup.categoryName;
}

export class GuildSetupManager {
	// ── Phase 1: auto-construct on join / restart ─────────────
	// What: build the homebase category + six channels, then persist a
	//       GuildConfig row describing them.
	// Who:  called from guildCreate in main.ts (first time the bot joins a
	//       guild) and from ensureHomebase when a rebuild is warranted.
	// When: once per guild per lifecycle of this bot installation, unless
	//       the caller sets options.force.
	// How:  the early return guard skips the build when an existing
	//       GuildConfig row for this guildId is found, UNLESS force is set.
	//       The force flag is the escape hatch ensureHomebase uses when it
	//       has already determined the stored row is foreign (owned by a
	//       different bot) — in that case we must proceed and build our own
	//       homebase without touching the foreign row. Schema has a unique
	//       index on guildId, so if the foreign row is still in the same
	//       collection the create call will throw a duplicate key error.
	//       We log that loudly and bail rather than silently corrupting
	//       anything. Expectation is that the operator runs dev and prod
	//       against separate MongoDB clusters; this guard is defense in
	//       depth against a misconfigured MONGOOSE_URI.
	static async autoSetup(guild: Guild, config: ISetupConfig, options: { force?: boolean } = {}): Promise<void> {
		const existing = await guildConfigStore.findByGuildId(config.guildId);
		// default behavior: if a row exists, assume the homebase is already
		// constructed (by this bot) and skip. ensureHomebase is the only
		// caller that knows the row is stale or foreign and sets force to
		// bypass. A "stale" row means the category or channels were deleted
		// in Discord but the row in our DB still points at those dead ids —
		// we want to refresh the ids on THAT row, not insert a second one.
		if (existing?.categoryId && !options.force) return;

		// owner-only category until admin role is assigned in Phase 2.
		// the name picks up the "(dev)" suffix automatically when running in
		// NODE_ENV=development so a dev bot can coexist with prod in a shared
		// guild without fighting over a single home base.
		const category = await guild.channels.create({
			name: resolveCategoryName(),
			type: ChannelType.GuildCategory,
			permissionOverwrites: [
				{
					id: guild.roles.everyone.id,
					deny: [PermissionFlagsBits.ViewChannel],
				},
				{
					id: config.ownerId,
					allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
				},
			],
		});

		const { ids, objects } = await GuildSetupManager.createChannels(guild, category, config);
		const { scheduleMessageId, introMessageIds } = await GuildSetupManager.populateChannels(objects);

		// What: persist the freshly built channel ids.
		// When: two mutually exclusive persist paths, chosen by the state of
		//       `existing`:
		//         path A — no row exists yet: create a new row.
		//         path B — a row exists AND force is true: update in place.
		//                  This is the "our row but the Discord side was
		//                  wiped" case. We never hit this path unless the
		//                  caller has already proven ownership (ensureHomebase
		//                  runs the ownership probe first) or is handling a
		//                  missing category (which can only belong to us if
		//                  our row holds its id).
		// How:   path B uses update which matches on guildId and $set's the
		//        fresh ids. The adminRoleId / memberRoleId / setupComplete
		//        flags are preserved because we do not set them in the
		//        update payload — any prior Phase 2 state carries over to
		//        the repaired homebase.
		// Where: path A's create is wrapped in a duplicate-key guard for the
		//        shared cluster misconfig case (dev bot running against the
		//        same MongoDB collection as prod). We REFUSE to overwrite a
		//        foreign row; the Discord side is already built so the least
		//        bad outcome is that the bot logs loudly and bails on persist.
		const persistPayload = {
			categoryId: category.id,
			introChannelId: ids.introChannelId,
			commandsChannelId: ids.commandsChannelId,
			leaderboardChannelId: ids.leaderboardChannelId,
			scheduleChannelId: ids.scheduleChannelId,
			announcementsChannelId: ids.announcementsChannelId,
			adminChannelId: ids.adminChannelId,
			// scheduleMessageId anchors the pinned schedule board that
			// ScheduleBoard.refreshSchedule keeps up to date. see
			// src/features/schedule/ScheduleBoard.ts for the lifecycle.
			scheduleMessageId,
			// introMessageIds anchors every other intro embed so
			// refreshIntroEmbeds can edit them in place on subsequent boots
			// when embed-content.ts copy changes. This is the field that
			// makes "rebuild the bot copy without nuking the homebase"
			// possible.
			introMessageIds,
		};

		if (existing) {
			// path B — in place update of our existing row. Phase 2 state
			// (adminRoleId, memberRoleId, setupComplete) is intentionally
			// not overwritten so a repair preserves it.
			await guildConfigStore.update(config.guildId, persistPayload);
			return;
		}

		try {
			// path A — fresh insert. initialize Phase 2 fields to null so the
			// unsetup state matches a clean install.
			await guildConfigStore.create({
				guildId: config.guildId,
				adminRoleId: null,
				memberRoleId: null,
				...persistPayload,
				setupComplete: false,
			});
		} catch (error) {
			// MongoDB duplicate key (code 11000) means a row for this guildId
			// already exists — almost certainly the shared DB scenario where
			// another bot's row is in the collection. We REFUSE to overwrite
			// it (that would corrupt the other bot's state). The Discord side
			// channels are already built at this point so this is the least
			// bad outcome: bot stays online but cannot persist its config
			// until the operator separates the DBs. Logged loudly so the
			// smell is impossible to miss.
			const code = (error as { code?: number }).code;
			if (code === 11000) {
				console.error(LOG_MESSAGES.setup.guildConfigDuplicateKey(config.guildId));
			}
			throw error;
		}
	}

	// ── Phase 1.5: self heal on wake up ───────────────────────
	// What: when the bot comes online, scan each guild's homebase for damage.
	//       Three possible outcomes per guild:
	//         - category is gone or was never ours → rebuild everything via
	//           autoSetup and announce "castle rebuilt" in the new inner
	//           sanctum.
	//         - category is ours and intact but individual channels were
	//           deleted → rebuild just those channels under the existing
	//           category, update GuildConfig with the new ids, and post a
	//           per channel repair notice to the inner sanctum.
	//         - everything present and ours → no op.
	// Who:  called from client.once("ready") in main.ts for each guild the
	//       bot is cached in. Never adopts a homebase this bot did not
	//       create; that invariant is enforced by the ownership probe
	//       before any repair work runs.
	// When: once per guild per process boot. Any repair performed here will
	//       update GuildConfig, so the next boot skips straight through.
	// Where: pairs with rebuildHomebase in ScheduleBoard.ts. That path is
	//        triggered at runtime when a schedule refresh detects author
	//        mismatch. This path is the boot time counterpart and adds per
	//        channel repair coverage the schedule path does not have.
	// How:  ① load GuildConfig. If missing, build fresh (arrival DM flows
	//          from the caller in main.ts).
	//       ② Fetch the stored category; if gone, full rebuild.
	//       ③ Probe ownership via the stored schedule message; if foreign,
	//          full rebuild.
	//       ④ Run repairMissingChannels. If anything was rebuilt, post
	//          per channel notices to the (possibly just rebuilt) inner
	//          sanctum.
	//       ⑤ Otherwise, skip.
	static async ensureHomebase(client: Client, guild: Guild): Promise<IEnsureHomebaseResult> {
		// emit a sweep-start marker. without this it is hard to tell from
		// production logs whether ensureHomebase actually ran for a given
		// guild or was masked by an earlier error in the ready loop.
		console.log(LOG_MESSAGES.setup.ensureHomebaseStart(guild.id));

		const stored = await guildConfigStore.findByGuildId(guild.id);

		// ① no config at all → never built for this guild. build fresh.
		if (!stored) {
			await GuildSetupManager.autoSetup(guild, { guildId: guild.id, ownerId: guild.ownerId });
			console.log(LOG_MESSAGES.setup.ensureHomebaseDone(guild.id, "built"));
			return { action: "built", repairedChannels: [] };
		}

		// ② category gone? null from fetch catch, or a Discord 10003 on the
		//    direct fetch path. Either way the stored homebase doesn't exist.
		const category = await guild.channels.fetch(stored.categoryId).catch(() => null);
		if (!category) {
			console.warn(LOG_MESSAGES.setup.homebaseCategoryMissing(stored.categoryId, guild.id));
			await GuildSetupManager.rebuildFromStaleConfig(guild);
			await GuildSetupManager.postCastleRebuiltNotice(client, guild.id);
			console.log(LOG_MESSAGES.setup.ensureHomebaseDone(guild.id, "rebuilt"));
			return { action: "rebuilt", repairedChannels: [] };
		}

		// ③ category exists but is it ours? Discord does not expose a
		//    creator/owner field on CategoryChannel, so we fall back to the
		//    same signal ScheduleBoard uses at refresh time: fetch the
		//    stored scheduleMessageId and compare authors. Every autoSetup
		//    posts exactly this message, so it is a reliable provenance
		//    marker for the whole homebase.
		const ownedByUs = await GuildSetupManager.isHomebaseOwnedByThisBot(client, guild.id, stored);
		if (!ownedByUs) {
			console.warn(LOG_MESSAGES.setup.homebaseNotOwned(guild.id));
			await GuildSetupManager.rebuildFromStaleConfig(guild);
			await GuildSetupManager.postCastleRebuiltNotice(client, guild.id);
			console.log(LOG_MESSAGES.setup.ensureHomebaseDone(guild.id, "rebuilt"));
			return { action: "rebuilt", repairedChannels: [] };
		}

		// ④ category is ours. scan each of the six child channels and
		//    rebuild any that were deleted while the bot was offline.
		//    repairMissingChannels also posts the per channel notices so
		//    this method stays focused on branching logic.
		const repairedChannels = await GuildSetupManager.repairMissingChannels(client, guild, category as CategoryChannel);
		if (repairedChannels.length > 0) {
			console.log(LOG_MESSAGES.setup.ensureHomebaseDone(guild.id, "repaired"));
			return { action: "repaired", repairedChannels };
		}

		// ⑤ happy path: stored homebase exists, is owned by this bot, and
		//    all six channels are present.
		console.log(LOG_MESSAGES.setup.ensureHomebaseDone(guild.id, "skipped"));
		return { action: "skipped", repairedChannels: [] };
	}

	// ── channel spec type ─────────────────────────────────────
	// What: describes one of the six homebase channels enough to rebuild it.
	// Who:  repairMissingChannels (boot sweep) and ChannelDeleteWatcher
	//       (realtime). Both consume the same specs so the repair posture
	//       stays identical regardless of which entry point fired.
	// Where: exported as CHANNEL_SPECS below so the realtime listener can
	//        map a deleted channel id to a spec by walking the list.
	// How:   `intro` is a thunk on GuildSetupManager + the shared stored row
	//        because the admin channel's intro needs the fresh adminRoleId.
	//        Callers pass in a guild + stored getter pair so the thunk can
	//        resolve values lazily at post time.
	static readonly CHANNEL_FIELDS = [
		"introChannelId",
		"commandsChannelId",
		"leaderboardChannelId",
		"scheduleChannelId",
		"announcementsChannelId",
		"adminChannelId",
		// seventh homebase channel. home of the NextUpBoard — a new post
		// per upcoming event (or same day group) inside the 24h rolling
		// horizon, so leaders get a scrollable audit trail separate from
		// the living calendar in scheduleChannelId.
		"nextDecreeChannelId",
	] as const;

	// exported so ChannelDeleteWatcher can map a deleted channel id to its
	// spec without re declaring the list. Keep in sync with CHANNEL_FIELDS.
	static readonly CHANNEL_SPECS: Array<{
		configField: (typeof GuildSetupManager.CHANNEL_FIELDS)[number];
		displayName: string;
		kind: "public" | "admin";
	}> = [
		{ configField: "introChannelId", displayName: channels.intro, kind: "public" },
		{ configField: "commandsChannelId", displayName: channels.commands, kind: "public" },
		{ configField: "leaderboardChannelId", displayName: channels.leaderboard, kind: "public" },
		{ configField: "scheduleChannelId", displayName: channels.schedule, kind: "public" },
		{ configField: "announcementsChannelId", displayName: channels.announcements, kind: "public" },
		{ configField: "adminChannelId", displayName: channels.admin, kind: "admin" },
		// 🛡️ seventh — next-decree. public so mortals see the board
		// posts, bot only writes (the category level overwrites already
		// gate SendMessages for "public" kind).
		{ configField: "nextDecreeChannelId", displayName: channels.nextDecree, kind: "public" },
	];

	// ── intro content resolver ────────────────────────────────
	// What: pick the right ChannelContent embed for a given spec, reading
	//       adminRoleId off the currently known stored config so post Phase 2
	//       guilds get the populated admin welcome instead of the placeholder.
	// Who:  repairOneChannel. Also usable by the realtime watcher.
	// How:   plain switch on configField so a future spec addition becomes
	//        a compile error here until the case is added.
	private static resolveIntroEmbed(
		field: (typeof GuildSetupManager.CHANNEL_FIELDS)[number],
		guild: Guild,
		adminRoleId: string | null
	): EmbedBuilder {
		switch (field) {
			case "introChannelId":
				return ChannelContent.introduction();
			case "commandsChannelId":
				return ChannelContent.commandGuide();
			case "leaderboardChannelId":
				return ChannelContent.leaderboardIntro();
			case "scheduleChannelId":
				return ChannelContent.scheduleIntro();
			case "announcementsChannelId":
				return ChannelContent.announcementsIntro();
			case "adminChannelId":
				// after Phase 2 the admin channel's intro is the populated
				// adminWelcome with the real adminRoleId. before Phase 2 it is
				// the "role pending" placeholder.
				return adminRoleId ? ChannelContent.adminWelcome(guild.ownerId, adminRoleId) : ChannelContent.adminPending();
			case "nextDecreeChannelId":
				// pinned header above the NextUpBoard audit trail posts.
				// Does not depend on adminRoleId because this is a public
				// channel — mortals read, bot writes.
				return ChannelContent.nextDecreeIntro();
		}
	}

	// ── resolveIntroComponents ────────────────────────────────────
	// What:  returns the action row(s) that should accompany a given
	//        channel's intro embed, or null if the channel has no
	//        component surface (the common case). Only the introductions
	//        channel currently has a component row (the "Summon me to
	//        your server, Mortal" invite button).
	// Who:   populateChannels on first build (via the send() call for
	//        the intro channel) and refreshIntroEmbeds on every boot
	//        (both the edit-in-place and repost paths must pass
	//        components or Discord silently drops them).
	// When:  called per spec during the intro sweep.
	// Where: parallels resolveIntroEmbed so a future channel that grows
	//        a component row (eg. an invite button for a central
	//        announcement channel) can be added with a single new case.
	// How:   switch on the spec. Returning null means "do not touch
	//        components"; returning an array means "replace components
	//        with this array."
	private static resolveIntroComponents(
		field: (typeof GuildSetupManager.CHANNEL_FIELDS)[number]
	): ActionRowBuilder<ButtonBuilder>[] | null {
		switch (field) {
			case "introChannelId":
				return [ChannelContent.introductionComponents()];
			default:
				return null;
		}
	}

	// ── embed equivalence check ──────────────────────────────────
	// What: returns true when a freshly generated intro embed has the
	//       same user-visible content as the embed attached to an
	//       already posted message. Used by refreshIntroEmbeds to skip
	//       the "post a new copy" path when nothing has actually
	//       changed — without this guard the owner's "never edit,
	//       never delete" policy would cause a fresh post on every boot
	//       whether the copy changed or not, drowning every channel in
	//       duplicate intros.
	// Who:  refreshIntroEmbeds; not exported because the comparison
	//       rules are specific to the intro sweep. Other call sites
	//       that need embed diffing should author their own helpers
	//       tuned to their own content shape.
	// When: once per spec per boot.
	// Where: title + description + fields are the user-visible surface.
	//        Footer text and color are derived from constants that do
	//        not change per boot, so skipping them keeps the check
	//        cheap and stable against non-copy drift (eg. timestamps
	//        embed builders may stamp for their own reasons).
	// How:  extract the comparable fields from both sides and JSON
	//       stringify. Arrays of fields are compared by stringification
	//       so field order matters — which is correct: a reorder is a
	//       user-visible change worth posting a new copy for.
	private static embedsAreEquivalent(
		fresh: EmbedBuilder,
		stored: Embed | undefined
	): boolean {
		if (!stored) return false;
		const a = fresh.data;
		const aFields = Array.isArray(a.fields) ? a.fields : [];
		const bFields = Array.isArray(stored.fields) ? stored.fields : [];

		if ((a.title ?? null) !== (stored.title ?? null)) return false;
		if ((a.description ?? null) !== (stored.description ?? null)) return false;
		if (aFields.length !== bFields.length) return false;

		// Field-by-field compare. Name + value are the only fields that
		// affect what the mortal reads; inline is rarely set on our
		// intros but we compare anyway in case a future intro uses it.
		for (let i = 0; i < aFields.length; i++) {
			const af = aFields[i];
			const bf = bFields[i];
			if (!af || !bf) return false;
			if (af.name !== bf.name) return false;
			if (af.value !== bf.value) return false;
			if ((af.inline ?? false) !== (bf.inline ?? false)) return false;
		}
		return true;
	}

	// ── single channel repair primitive ───────────────────────
	// What: rebuild one homebase channel under the given category, repost the
	//       intro, persist the new channel id on GuildConfig. Shared between
	//       the boot sweep (repairMissingChannels) and the realtime listener
	//       (ChannelDeleteWatcher) so the repair posture is identical across
	//       entry points.
	// Who:  repairMissingChannels, ChannelDeleteWatcher.
	// When: caller has already proven (a) the homebase category is intact and
	//       bot owned, (b) the specific channel this spec targets is missing.
	// Where: returns the fresh stored config object with the new channel id
	//        applied so the caller can pass it into postRepairNotices without
	//        a second DB read. Callers must NOT reuse the `stored` they
	//        passed in — fields will be stale.
	// How:   ① buildSingleChannel with the spec's kind + the known adminRoleId.
	//        ② fire-and-forget the intro embed. failures are logged and
	//           swallowed because the channel is already functional.
	//        ③ persist: { [configField]: newChannel.id } plus, for the
	//           schedule channel, scheduleMessageId: null so ScheduleBoard
	//           reposts a fresh pinned board on its next refresh.
	//        ④ return the merged stored so caller has the fresh adminChannelId
	//           if the admin channel itself was the one repaired.
	static async repairOneChannel(
		guild: Guild,
		category: CategoryChannel,
		spec: (typeof GuildSetupManager.CHANNEL_SPECS)[number],
		stored: Record<string, unknown> & { adminRoleId?: string | null }
	): Promise<{ newChannel: TextChannel; stored: typeof stored }> {
		// ── adopt-before-build guard ───────────────────────────────
		// What:  before creating a brand new channel, scan the category
		//        for an existing text channel whose name matches this
		//        spec's displayName. If one exists, adopt it: persist
		//        its id onto GuildConfig and reuse the existing channel
		//        as-is.
		// Why:   the "stored id is null" branch in repairMissingChannels
		//        would otherwise rebuild a channel whose name already
		//        exists under the category, producing a duplicate. This
		//        happens on any guild where a previous deploy created
		//        the channel in Discord but failed to persist the id
		//        before the process exited (eg. the seventh-channel
		//        migration race seen on guild 910668785856413707 where
		//        two `🛡️next-decree` channels ended up side by side
		//        after yesterday's null-id rebuild fix landed).
		// Who:   repairOneChannel; this is the single choke point for
		//        both the boot sweep and the realtime delete watcher.
		// When:  runs every repair, but the expensive create is only
		//        skipped on match. The category's .children cache is
		//        already populated — no extra network round trip.
		// Where: the emoji-prefixed displayName (🛡️next-decree,
		//        📜introductions, etc) makes accidental collisions with
		//        admin-created channels effectively impossible; no
		//        reasonable admin types the leading emoji by hand.
		// How:   find by case-sensitive name match + TextChannel
		//        instance check. Fall through to buildSingleChannel only
		//        when no existing channel qualifies.
		const existingByName = category.children.cache.find(
			(child): child is TextChannel => child instanceof TextChannel && child.name === spec.displayName
		);
		const newChannel = existingByName
			? existingByName
			: await GuildSetupManager.buildSingleChannel(guild, category, spec.displayName, spec.kind, stored.adminRoleId ?? null);
		if (existingByName) {
			console.warn(LOG_MESSAGES.setup.channelAdopted(spec.displayName, guild.id));
		}

		// ── intro message resolution ────────────────────────────────
		// Two paths, merged:
		//   A. Fresh build (!existingByName): post an intro embed,
		//      capture the new message id. This is the historical
		//      behavior — a newly created channel has no intro yet.
		//   B. Adopted existing channel: scan the most recent messages
		//      for a bot-authored embed that matches the spec's intro.
		//      If found, reuse its id — DO NOT post a duplicate. If not
		//      found (eg. the existing channel was emptied by an admin),
		//      fall through to the same post-a-fresh-intro path as A so
		//      the adopted channel still ends up with the pinned intro.
		//
		// Why the scan only looks at the latest ~20 messages: a stray
		// intro embed further back in history is rare (bot is the only
		// author in its own homebase channels) and the scan is cheap.
		// If the adopted channel has 500 messages from a prior setup
		// cycle, we accept that a very old intro won't be adopted — the
		// fresh one we post beneath it is correct, and the historical
		// one is just harmless scrollback. Most guilds hitting this
		// branch have NO messages (the channel was just created but
		// never had its id persisted).
		let introMessageId: string | null = null;
		const introEmbed = GuildSetupManager.resolveIntroEmbed(spec.configField, guild, stored.adminRoleId ?? null);
		const introComponents = GuildSetupManager.resolveIntroComponents(spec.configField);

		try {
			if (existingByName) {
				// Scan for an existing bot-authored intro embed with a
				// matching title. Embed titles are stable identifiers
				// for each intro (nextDecreeIntro → "🛡️ The Next Decree",
				// etc.) so title comparison is the cheapest way to
				// recognize our own prior post without storing a hash.
				const selfId = guild.client.user?.id;
				const targetTitle = introEmbed.data.title ?? null;

				const recent = await newChannel.messages.fetch({ limit: 20 }).catch(() => null);
				const existingIntro = recent?.find((msg) => {
					if (!selfId || msg.author.id !== selfId) return false;
					if (msg.embeds.length === 0) return false;
					const firstTitle = msg.embeds[0]?.title ?? null;
					return firstTitle !== null && firstTitle === targetTitle;
				});

				if (existingIntro) {
					// Adopt the existing intro. Also run an in-place
					// edit so any copy changes in embed-content.ts since
					// the prior post land immediately (same contract as
					// refreshIntroEmbeds but scoped to this one message).
					introMessageId = existingIntro.id;
					try {
						await existingIntro.edit({ embeds: [introEmbed], components: introComponents ?? [] });
					} catch (editError) {
						// edit failure is non fatal — the old embed stands.
						console.warn(LOG_MESSAGES.setup.channelRepairFailed(spec.displayName, guild.id), editError);
					}
				}
			}

			if (!introMessageId) {
				// Fresh post path: either a brand new channel (path A
				// above) or an adopted channel with no matching intro.
				const introMessage = await newChannel.send({
					embeds: [introEmbed],
					components: introComponents ?? [],
				});
				introMessageId = introMessage.id;
				// schedule channel's intro doubles as the pinned board
				// anchor — repin on repair to preserve that invariant.
				if (spec.configField === "scheduleChannelId") {
					try {
						await introMessage.pin();
					} catch (pinError) {
						console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(guild.id), pinError);
					}
				}
			}
		} catch (error) {
			console.warn(LOG_MESSAGES.setup.channelRepairFailed(spec.displayName, guild.id), error);
		}

		// persist new ids. three pieces move together on a repair:
		//   - spec.configField → new channel id
		//   - introMessageIds[spec.configField] → new intro message id (or
		//     null if the intro post failed; refreshIntroEmbeds will repost
		//     on the next boot)
		//   - scheduleMessageId → the fresh pinned board anchor if this was
		//     the schedule channel, else left alone.
		// The prior introMessageIds sub fields are preserved by merging onto
		// whatever the caller passed in.
		const priorIntroIds =
			(stored.introMessageIds as Record<string, string | null> | undefined) ?? {};
		const nextIntroIds: Record<string, string | null> = { ...priorIntroIds, [spec.configField]: introMessageId };

		const update: Record<string, unknown> = {
			[spec.configField]: newChannel.id,
			introMessageIds: nextIntroIds,
		};
		if (spec.configField === "scheduleChannelId") {
			// scheduleMessageId tracks the pinned board anchor. on a schedule
			// channel repair the newly posted intro IS the fresh anchor.
			update.scheduleMessageId = introMessageId;
		}
		await guildConfigStore.update(guild.id, update);
		console.warn(LOG_MESSAGES.setup.channelRepaired(spec.displayName, guild.id));

		// merge so caller sees the fresh ids without a second round trip.
		return { newChannel, stored: { ...stored, ...update } };
	}

	// ── channel level self heal (boot sweep) ─────────────────
	// What: for each of the six homebase channels stored on GuildConfig,
	//       verify the channel still exists in Discord. Rebuild any that
	//       are missing using repairOneChannel, then post one per channel
	//       notice into the inner sanctum.
	// Who:  ensureHomebase.
	// When: only when the category itself is intact and bot owned.
	// Where: delegates the per channel rebuild work to repairOneChannel so
	//        the realtime listener shares the same primitive.
	// How:  walk CHANNEL_SPECS, skip specs whose channels still exist,
	//       delegate rebuilds to repairOneChannel, accumulate display names,
	//       post notices at the end. Errors on a single spec do not stop
	//       the others.
	static async repairMissingChannels(client: Client, guild: Guild, category: CategoryChannel): Promise<string[]> {
		// re read the config here so we pick up the freshest admin role /
		// owner / channel ids. the caller only passed us the initial state.
		let stored = (await guildConfigStore.findByGuildId(guild.id)) as
			| (Record<string, unknown> & { adminRoleId?: string | null; adminChannelId: string })
			| null;
		if (!stored) return [];

		const repaired: string[] = [];
		for (const spec of GuildSetupManager.CHANNEL_SPECS) {
			const storedId = stored[spec.configField] as string | null | undefined;

			// What:  decide whether this spec needs a rebuild. Three states:
			//        ① stored id present AND channel exists → skip (happy
			//           path, most guilds most of the time);
			//        ② stored id present AND channel missing → rebuild the
			//           channel, persist the new id;
			//        ③ stored id null/undefined → rebuild the channel. This
			//           is the "legacy guild predating a new channel spec"
			//           case. Example: the nextDecreeChannelId field was
			//           added after some guilds had already run /setup, so
			//           those rows load with a null stored id and the
			//           channel has never existed in Discord. Before this
			//           branch, the sweep skipped them forever; the channel
			//           would only appear if the owner nuked and re-ran
			//           /setup from scratch, which is a terrible migration
			//           story. Treat null as "also missing, rebuild too."
			// Where: repairOneChannel is already idempotent — it builds the
			//        channel, posts the intro, persists the new id. The only
			//        extra concern is existing:null below: when storedId is
			//        null we have nothing to fetch, so skip the fetch and go
			//        straight to the rebuild path.
			if (storedId) {
				// resolve the channel. null (cache miss) and fetch throws both
				// mean rebuild. misconfigured-but-present channels are out of
				// scope for boot time self heal.
				const existing = await guild.channels.fetch(storedId).catch(() => null);
				if (existing) continue;
			}
			// fallthrough: either storedId was falsy, or the channel was
			// missing despite a stored id. Either way, build it.

			try {
				const result = await GuildSetupManager.repairOneChannel(guild, category, spec, stored);
				// refresh local stored so the next spec + the notice post
				// step below see the new ids. Notably: if the admin channel
				// was the one repaired, stored.adminChannelId now points at
				// the new channel which is exactly where we want the notice.
				stored = result.stored as typeof stored;
				repaired.push(spec.displayName);
			} catch (error) {
				console.error(LOG_MESSAGES.setup.channelRepairFailed(spec.displayName, guild.id), error);
				// continue to next spec. one failure should not block the
				// others from being repaired.
			}
		}

		if (repaired.length === 0) return [];

		// stored.adminChannelId points at the latest (possibly just rebuilt)
		// inner sanctum, so notices never land in a deleted channel.
		await GuildSetupManager.postRepairNotices(client, guild.id, stored.adminChannelId, repaired);
		return repaired;
	}

	// ── single channel builder ────────────────────────────────
	// What: recreate one text channel under the given category with the
	//       same overwrites autoSetup.createChannels would have used for
	//       its kind. If the guild has already run Phase 2 and has an
	//       adminRoleId, that role's overwrite is layered on as well so
	//       repaired channels preserve the admin surface.
	// Who:  repairMissingChannels. Private because the overwrites are a
	//       mirror of createChannels and callers have no business tuning
	//       them ad hoc.
	// When: only from the repair path. autoSetup has its own bulk creation
	//       because it creates all six in parallel with Promise.all.
	// Where: keeps the posture identical to the original build, so a
	//        repaired channel is indistinguishable from one created during
	//        /setup except for the Discord creation timestamp.
	// How:  branch on kind for the base overwrites, append the admin role
	//       grant when applicable, then call guild.channels.create.
	private static async buildSingleChannel(
		guild: Guild,
		category: CategoryChannel,
		name: string,
		kind: "public" | "admin",
		adminRoleId: string | null
	): Promise<TextChannel> {
		const publicOverwrites = [
			{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
			{ id: guild.ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
		];
		const adminOverwrites = [
			{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
			{
				id: guild.ownerId,
				allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
			},
		];

		// layer the admin role grant on top of the base overwrites when
		// the guild has already run Phase 2. public channels get send
		// permission; the admin channel gets full access.
		const overwrites = kind === "public" ? [...publicOverwrites] : [...adminOverwrites];
		if (adminRoleId) {
			overwrites.push({
				id: adminRoleId,
				allow:
					kind === "public"
						? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
						: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
			});
		}

		// guild.channels.create with ChannelType.GuildText always returns
		// a TextChannel; the cast is safe and saves a narrow in the caller.
		const created = (await guild.channels.create({
			name,
			type: ChannelType.GuildText,
			parent: category.id,
			permissionOverwrites: overwrites,
		})) as TextChannel;
		return created;
	}

	// ── audit notices ─────────────────────────────────────────
	// What: post one "channel restored" notice per repaired channel into
	//       the inner sanctum. If the admin channel itself was just
	//       repaired, adminChannelId refers to the NEW channel already
	//       because repairMissingChannels updated the stored state before
	//       calling here.
	// Who:  repairMissingChannels.
	// When: only when at least one channel was actually rebuilt.
	// Where: errors posting the notices are swallowed with a warn. the
	//        repair itself already succeeded and the bot is functional —
	//        a missing audit line is a visibility issue, not a correctness
	//        one.
	// How:  fetch the admin channel, verify it is a TextChannel, loop and
	//       send the embed. sequential sends keep Discord's rate limiter
	//       happy when several channels were repaired at once.
	// promoted from private so ChannelDeleteWatcher can reuse the same post
	// path for its single channel notice. the method already handles the
	// "admin channel was the one repaired" case because callers pass in the
	// freshest adminChannelId.
	static async postRepairNotices(
		client: Client,
		guildId: string,
		adminChannelId: string,
		repairedChannelNames: string[]
	): Promise<void> {
		try {
			const channel = await client.channels.fetch(adminChannelId).catch(() => null);
			if (!channel || !(channel instanceof TextChannel)) return;
			for (const name of repairedChannelNames) {
				await channel.send({ embeds: [ChannelContent.channelRepairNotice(name)] });
			}
		} catch (error) {
			console.warn(LOG_MESSAGES.setup.repairNoticePostFailed(guildId), error);
		}
	}

	// ── castle rebuilt announcement ───────────────────────────
	// What: after a full category rebuild via rebuildFromStaleConfig,
	//       post the "castle rebuilt" embed in the newly created inner
	//       sanctum so the admin understands why the category looks new.
	// Who:  ensureHomebase, in both the "category gone" and "foreign
	//       category" branches.
	// When: exactly once per rebuild.
	// Where: reads the freshly written GuildConfig to get the NEW
	//        adminChannelId. swallows post failures because the rebuild
	//        itself succeeded and the bot is functional.
	// How:  find the new admin channel via client.channels.fetch, verify
	//       it is a TextChannel, send the embed.
	private static async postCastleRebuiltNotice(client: Client, guildId: string): Promise<void> {
		try {
			const fresh = await guildConfigStore.findByGuildId(guildId);
			if (!fresh?.adminChannelId) return;
			const channel = await client.channels.fetch(fresh.adminChannelId).catch(() => null);
			if (!channel || !(channel instanceof TextChannel)) return;
			await channel.send({ embeds: [ChannelContent.castleRebuiltNotice()] });
		} catch (error) {
			console.warn(LOG_MESSAGES.setup.castleRebuiltNoticePostFailed(guildId), error);
		}
	}

	// ── ownership probe ───────────────────────────────────────
	// What: return true iff the stored scheduleMessageId resolves and is
	//       authored by the running bot account. Any other outcome (missing
	//       channel, missing message id, message deleted, author mismatch)
	//       means the stored homebase is not ours and must be rebuilt.
	// Who:  ensureHomebase on startup AND ChannelDeleteWatcher at runtime.
	//       Kept as its own method so both entry points use the same probe.
	// When: once per guild per boot, once per qualifying ChannelDelete event
	//       at runtime, or whenever any caller wants a cheap provenance
	//       check against Discord.
	// Where: intentionally does NOT call guildConfigStore.update — callers
	//        that act on the result own the follow up writes.
	// How:  bail early on any missing piece. Swallow 10008 / 10003 /
	//       cache misses as "not ours" so a single bad fetch does not crash
	//       the ready sweep for every other guild.
	static async isHomebaseOwnedByThisBot(
		client: Client,
		guildId: string,
		stored: { scheduleChannelId: string; scheduleMessageId?: string | null }
	): Promise<boolean> {
		const selfId = client.user?.id;
		// without our own bot id we cannot compare. treat as not owned so
		// the caller rebuilds rather than falsely adopting the config.
		if (!selfId) return false;
		if (!stored.scheduleMessageId) return false;

		const channel = await client.channels.fetch(stored.scheduleChannelId).catch(() => null);
		if (!channel || !(channel instanceof TextChannel)) return false;

		try {
			const message = await channel.messages.fetch(stored.scheduleMessageId);
			return message.author.id === selfId;
		} catch (error) {
			// 10008 Unknown Message, 10003 Unknown Channel → stored anchor is
			// gone. Any other Discord error also means we cannot confirm
			// ownership, so err on the side of rebuilding.
			if (error instanceof DiscordAPIError) {
				console.warn(LOG_MESSAGES.setup.homebaseOwnershipProbeFailed(guildId, error.code));
			} else {
				console.warn(LOG_MESSAGES.setup.homebaseOwnershipProbeFailed(guildId, "unknown"));
			}
			return false;
		}
	}

	// ── rebuild helper ────────────────────────────────────────
	// What: rerun autoSetup to build a fresh category + channels when the
	//       stored homebase is gone or foreign. Critically, this does NOT
	//       call deleteByGuildId. That would be destructive in the shared
	//       MongoDB cluster case (dev wiping prod's row and vice versa).
	//       A foreign row is never touched here.
	// Who:  ensureHomebase. Mirrors the private rebuildHomebase helper in
	//       ScheduleBoard.ts so runtime and boot time self heal take the
	//       same path.
	// When: only after ensureHomebase has positively determined the stored
	//       homebase is gone or foreign (either the category is missing in
	//       Discord, or the ownership probe came back negative).
	// Where: autoSetup is invoked with force:true so its own early return
	//        on "existing row" is bypassed. If the row in the DB is a
	//        foreign row (different bot's config), autoSetup's duplicate
	//        key handler will log loudly and bail on the persist step,
	//        leaving the fresh Discord channels built but unpersisted —
	//        the correct failure mode for the shared cluster misconfig.
	// How:   autoSetup(force:true) → if the DB slot is free, fresh row is
	//        written. If it is occupied by a foreign row, the unique index
	//        on guildId throws 11000 which autoSetup catches and logs.
	//        Either way the operator gets a signal and prod state is safe.
	private static async rebuildFromStaleConfig(guild: Guild): Promise<void> {
		await GuildSetupManager.autoSetup(guild, { guildId: guild.id, ownerId: guild.ownerId }, { force: true });
	}

	// ── Phase 2: apply admin role to existing channels ────────
	static async applyAdminRole(guild: Guild, config: IAdminRoleConfig): Promise<void> {
		const stored = await guildConfigStore.findByGuildId(config.guildId);
		if (!stored) throw new Error("No guild config found — channels have not been constructed yet.");

		const [category, introChannel, commandsChannel, leaderboardChannel, scheduleChannel, announcementsChannel, adminChannel] =
			(await Promise.all([
				guild.channels.fetch(stored.categoryId),
				guild.channels.fetch(stored.introChannelId),
				guild.channels.fetch(stored.commandsChannelId),
				guild.channels.fetch(stored.leaderboardChannelId),
				guild.channels.fetch(stored.scheduleChannelId),
				guild.channels.fetch(stored.announcementsChannelId),
				guild.channels.fetch(stored.adminChannelId),
			])) as (GuildChannel | null)[];

		// grant admin role access to category
		await category?.permissionOverwrites.create(config.adminRoleId, {
			ViewChannel: true,
			SendMessages: true,
			ReadMessageHistory: true,
		});

		// grant admin role send permissions on public channels
		for (const ch of [introChannel, commandsChannel, leaderboardChannel, scheduleChannel, announcementsChannel]) {
			await ch?.permissionOverwrites.create(config.adminRoleId, {
				ViewChannel: true,
				SendMessages: true,
			});
		}

		// grant admin role full access to admin channel
		await adminChannel?.permissionOverwrites.create(config.adminRoleId, {
			ViewChannel: true,
			SendMessages: true,
			ReadMessageHistory: true,
		});

		// post the real welcome message now that the role is known
		if (adminChannel?.isTextBased()) {
			await adminChannel.send({ embeds: [ChannelContent.adminWelcome(config.ownerId, config.adminRoleId)] });
		}

		await guildConfigStore.update(config.guildId, {
			adminRoleId: config.adminRoleId,
			memberRoleId: config.memberRoleId,
			setupComplete: true,
		});
	}

	// ── channel creation ──────────────────────────────────────
	private static async createChannels(
		guild: Guild,
		category: CategoryChannel,
		config: ISetupConfig
	): Promise<{ ids: ICreatedChannels; objects: IChannelObjects }> {
		// public channels — owner can send, everyone else read-only
		const publicOverwrites = [
			{
				id: guild.roles.everyone.id,
				allow: [PermissionFlagsBits.ViewChannel],
				deny: [PermissionFlagsBits.SendMessages],
			},
			{
				id: config.ownerId,
				allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
			},
		];

		// admin channel — owner only until Phase 2
		const adminOverwrites = [
			{
				id: guild.roles.everyone.id,
				deny: [PermissionFlagsBits.ViewChannel],
			},
			{
				id: config.ownerId,
				allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
			},
		];

		const [
			introChannel,
			commandsChannel,
			leaderboardChannel,
			scheduleChannel,
			announcementsChannel,
			adminChannel,
			nextDecreeChannel,
		] = await Promise.all([
			guild.channels.create({
				name: channels.intro,
				type: ChannelType.GuildText,
				parent: category.id,
				permissionOverwrites: publicOverwrites,
			}),
			guild.channels.create({
				name: channels.commands,
				type: ChannelType.GuildText,
				parent: category.id,
				permissionOverwrites: publicOverwrites,
			}),
			guild.channels.create({
				name: channels.leaderboard,
				type: ChannelType.GuildText,
				parent: category.id,
				permissionOverwrites: publicOverwrites,
			}),
			guild.channels.create({
				name: channels.schedule,
				type: ChannelType.GuildText,
				parent: category.id,
				permissionOverwrites: publicOverwrites,
			}),
			guild.channels.create({
				name: channels.announcements,
				type: ChannelType.GuildText,
				parent: category.id,
				permissionOverwrites: publicOverwrites,
			}),
			guild.channels.create({
				name: channels.admin,
				type: ChannelType.GuildText,
				parent: category.id,
				permissionOverwrites: adminOverwrites,
			}),
			// seventh — 🛡️next-decree. public overwrites (mortals read,
			// bot writes). Mirror of announcements at the permission
			// level but its own channel so the audit trail does not
			// collide with the 15/30 minute reminder pings.
			guild.channels.create({
				name: channels.nextDecree,
				type: ChannelType.GuildText,
				parent: category.id,
				permissionOverwrites: publicOverwrites,
			}),
		]);

		return {
			ids: {
				categoryId: category.id,
				introChannelId: introChannel.id,
				commandsChannelId: commandsChannel.id,
				leaderboardChannelId: leaderboardChannel.id,
				scheduleChannelId: scheduleChannel.id,
				announcementsChannelId: announcementsChannel.id,
				adminChannelId: adminChannel.id,
				nextDecreeChannelId: nextDecreeChannel.id,
			},
			objects: {
				introChannel,
				commandsChannel,
				leaderboardChannel,
				scheduleChannel,
				announcementsChannel,
				adminChannel,
				nextDecreeChannel,
			},
		};
	}

	// ── populate channels with initial content ────────────────
	// What:  post the six intro embeds, one per homebase channel, and return
	//        the resulting message ids so autoSetup can persist them on the
	//        GuildConfig row.
	// Who:   autoSetup (fresh build, Path A) and autoSetup (in place rebuild,
	//        Path B via ensureHomebase → rebuildFromStaleConfig).
	// When:  exactly once per build. Subsequent boots edit the stored ids in
	//        place via refreshIntroEmbeds rather than reposting.
	// Where: scheduleMessage keeps its special treatment — it is still the
	//        anchor the ScheduleBoard edits in place, and pinning is still
	//        best effort. The other five ids are new surface, driven by the
	//        introMessageIds field added to GuildConfig for boot time copy
	//        refreshes.
	// How:   Promise.all returns the messages in the same order we send them.
	//        We destructure with names so adding a seventh channel later does
	//        not silently shift positional indexes.
	private static async populateChannels(discordChannels: IChannelObjects): Promise<{
		scheduleMessageId: string;
		introMessageIds: {
			introChannelId: string;
			commandsChannelId: string;
			leaderboardChannelId: string;
			scheduleChannelId: string;
			announcementsChannelId: string;
			adminChannelId: string;
			nextDecreeChannelId: string;
			// Sibling to adminChannelId — both live in the same admin
			// channel. See GuildConfig.introMessageIds.adminCommandGuideId
			// for the rationale on breaking the one-key-per-channel
			// invariant.
			adminCommandGuideId: string;
		};
	}> {
		const {
			introChannel,
			commandsChannel,
			leaderboardChannel,
			scheduleChannel,
			announcementsChannel,
			adminChannel,
			nextDecreeChannel,
		} = discordChannels;

		const [
			introMsg,
			commandsMsg,
			leaderboardMsg,
			scheduleMessage,
			announcementsMsg,
			adminMsg,
			nextDecreeMsg,
			// ── second tracked message in adminChannel ───────────
			// The admin command guide lives in #inner-sanctum as a
			// sibling to adminWelcome. Sent in the same Promise.all so
			// posting happens in one batch and ordering is deterministic.
			// Persisted separately on introMessageIds.adminCommandGuideId
			// because the one-message-per-channel invariant does not
			// hold for this channel anymore.
			adminCommandGuideMsg,
		] = await Promise.all([
			// intro channel carries both the introduction embed AND the
			// "Summon me to your server, Mortal" link button. Components
			// travel alongside embeds on send; refreshIntroEmbeds must
			// also pass components on edit or Discord will drop the row.
			introChannel.send({
				embeds: [ChannelContent.introduction()],
				components: [ChannelContent.introductionComponents()],
			}),
			commandsChannel.send({ embeds: [ChannelContent.commandGuide()] }),
			leaderboardChannel.send({ embeds: [ChannelContent.leaderboardIntro()] }),
			scheduleChannel.send({ embeds: [ChannelContent.scheduleIntro()] }),
			announcementsChannel.send({ embeds: [ChannelContent.announcementsIntro()] }),
			adminChannel.send({ embeds: [ChannelContent.adminPending()] }),
			// Pinned header above the NextUpBoard posts. Pinning is best
			// effort (see schedule channel block below). The message id
			// is persisted on introMessageIds.nextDecreeChannelId so
			// refreshIntroEmbeds edits it in place on every boot.
			nextDecreeChannel.send({ embeds: [ChannelContent.nextDecreeIntro()] }),
			// Admin command guide, sibling of adminWelcome in the same
			// admin channel. Pinning handled below alongside the
			// schedule + next-decree pins.
			adminChannel.send({ embeds: [ChannelContent.adminCommandGuide()] }),
		]);

		try {
			await scheduleMessage.pin();
		} catch (error) {
			// pin requires ManageMessages. if the bot's role lacks it the
			// board still works, the intro just floats in recent history.
			console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(discordChannels.scheduleChannel.guildId), error);
		}

		// Pin the next-decree intro as well so mortals who scroll up see
		// it first even after the channel accumulates hundreds of
		// audit-trail posts. Same best effort posture as the schedule pin.
		try {
			await nextDecreeMsg.pin();
		} catch (error) {
			console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(discordChannels.nextDecreeChannel.guildId), error);
		}

		// Pin the public command center guide so mortals can always
		// scroll up to it even if the channel accumulates other content
		// in the future. Today #command-center is read-only for mortals
		// so in practice nothing pushes the guide down, but the pin
		// future-proofs it.
		try {
			await commandsMsg.pin();
		} catch (error) {
			console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(discordChannels.commandsChannel.guildId), error);
		}

		// Pin the admin command guide for the same reason as the public
		// one — the inner sanctum accumulates self-heal notices,
		// feature announcements, and ad-hoc admin chatter, so the pin
		// keeps the guide scannable as the primary reference.
		try {
			await adminCommandGuideMsg.pin();
		} catch (error) {
			console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(discordChannels.adminChannel.guildId), error);
		}

		return {
			scheduleMessageId: scheduleMessage.id,
			// mirrors the GuildConfig.introMessageIds shape so autoSetup can
			// hand this object straight into the persist payload without
			// reshaping.
			introMessageIds: {
				introChannelId: introMsg.id,
				commandsChannelId: commandsMsg.id,
				leaderboardChannelId: leaderboardMsg.id,
				scheduleChannelId: scheduleMessage.id,
				announcementsChannelId: announcementsMsg.id,
				adminChannelId: adminMsg.id,
				nextDecreeChannelId: nextDecreeMsg.id,
				adminCommandGuideId: adminCommandGuideMsg.id,
			},
		};
	}

	// ── intro embed refresh on boot ──────────────────────────────
	// What:  for each of the six homebase channels, edit the stored intro
	//        message in place so a restarted bot ships updated copy from
	//        embed-content.ts without forcing the operator to rebuild the
	//        homebase. If the stored message is missing, repost a fresh
	//        intro and persist the new id.
	// Who:   main.ts calls this inside the Events.ClientReady handler once
	//        per guild, AFTER ensureHomebase has run (so we never edit a
	//        channel that is about to be rebuilt).
	// When:  once per guild per process boot. Returns a summary so the
	//        caller can log aggregate numbers without knowing the per channel
	//        branches.
	// Where: paired with populateChannels. populateChannels writes the ids,
	//        refreshIntroEmbeds reads them and either edits or reposts.
	// How:   ① read fresh GuildConfig. bail if missing (ensureHomebase will
	//           have caught this already).
	//        ② for each spec, look up the stored message id under
	//           introMessageIds[spec.configField]. if null → no anchor yet
	//           (legacy row built before this field existed). treat like
	//           "stored message deleted" and repost a fresh intro.
	//        ③ fetch the channel and the message. on Discord 10008 (Unknown
	//           Message) or 10003 (Unknown Channel), repost + persist.
	//        ④ on 50005 (Cannot edit message authored by another user), we
	//           do NOT repost. That error means our stored id points at a
	//           foreign message — corruption case; leave it for the next
	//           ensureHomebase pass to sort out.
	//        ⑤ edit in place with the current embed. swallow transient
	//           errors (rate limit, outage) so one bad channel does not
	//           block the other five.
	static async refreshIntroEmbeds(client: Client, guild: Guild): Promise<{ edited: number; reposted: number }> {
		console.log(LOG_MESSAGES.setup.introRefreshStarted(guild.id));

		const stored = (await guildConfigStore.findByGuildId(guild.id)) as
			| (Record<string, unknown> & {
					adminRoleId?: string | null;
					introMessageIds?: Partial<Record<(typeof GuildSetupManager.CHANNEL_FIELDS)[number], string | null>> | null;
			  })
			| null;
		if (!stored) {
			// no config → ensureHomebase already owns this case. nothing to
			// refresh. zeroed summary keeps the caller's log tidy.
			console.log(LOG_MESSAGES.setup.introRefreshDone(guild.id, 0, 0));
			return { edited: 0, reposted: 0 };
		}

		let edited = 0;
		let reposted = 0;
		// mutate a local copy of introMessageIds as we go so reposts that
		// need a persist can be batched at the end. keeps DB writes to one
		// per guild in the common case.
		// Cast is necessary because the shared Partial<Record<CHANNEL_FIELDS,...>>
		// type on `stored.introMessageIds` does not include the flat
		// non-channel keys we have added (adminCommandGuideId). Accessing
		// it through `Record<string, string | null | undefined>` gives us
		// a runtime-safe read without widening the declared type.
		const storedIntroIds = (stored.introMessageIds ?? {}) as Record<string, string | null | undefined>;
		const nextIntroIds: Record<string, string | null> = {
			introChannelId: storedIntroIds.introChannelId ?? null,
			commandsChannelId: storedIntroIds.commandsChannelId ?? null,
			leaderboardChannelId: storedIntroIds.leaderboardChannelId ?? null,
			scheduleChannelId: storedIntroIds.scheduleChannelId ?? null,
			announcementsChannelId: storedIntroIds.announcementsChannelId ?? null,
			adminChannelId: storedIntroIds.adminChannelId ?? null,
			// legacy rows predating the seventh channel have this as null.
			// refreshIntroEmbeds then treats it like any other missing
			// anchor — reposts a fresh intro the first time the channel
			// is present and persists the new id.
			nextDecreeChannelId: storedIntroIds.nextDecreeChannelId ?? null,
			// Flat key (not a channel id) for the second tracked message
			// in #inner-sanctum. Legacy rows built before the split load
			// as null; the post-loop handler below treats null as "no
			// anchor → post a fresh admin command guide and persist it."
			adminCommandGuideId: storedIntroIds.adminCommandGuideId ?? null,
		};
		let needsPersist = false;

		for (const spec of GuildSetupManager.CHANNEL_SPECS) {
			const channelId = stored[spec.configField] as string | null | undefined;
			if (!channelId) continue;

			const channel = await client.channels.fetch(channelId).catch(() => null);
			if (!channel) {
				console.warn(LOG_MESSAGES.setup.introRefreshChannelMissing(spec.displayName, guild.id));
				continue;
			}
			if (!(channel instanceof TextChannel)) {
				console.warn(LOG_MESSAGES.setup.introRefreshChannelWrongType(spec.displayName, guild.id));
				continue;
			}

			const embed = GuildSetupManager.resolveIntroEmbed(spec.configField, guild, stored.adminRoleId ?? null);
			// Components (eg. the introductions channel's invite button)
			// must be passed explicitly on send — omitting them would
			// silently strip the invite button on every repost.
			// resolveIntroComponents returns null for the channels that
			// have no component surface; we pass `[]` in that case so
			// the send call is explicit about "no components."
			const componentRows = GuildSetupManager.resolveIntroComponents(spec.configField);
			const storedMessageId = nextIntroIds[spec.configField];

			// ── schedule channel exception: edit-in-place ──────────
			// The pinned schedule board is the one place the owner
			// granted permission to keep editing (see 2026-04-24
			// "never edit, never delete" policy). ScheduleBoard.ts
			// owns the actual board content; refreshIntroEmbeds only
			// needs to make sure the intro/anchor message is pinned.
			// For schedule we do NOT apply the diff+post flow below.
			if (spec.configField === "scheduleChannelId") {
				if (storedMessageId) {
					try {
						const message = await channel.messages.fetch(storedMessageId);
						await message.edit({ embeds: [embed], components: componentRows ?? [] });
						if (!message.pinned) {
							try {
								await message.pin();
							} catch (pinError) {
								console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(guild.id), pinError);
							}
						}
						edited += 1;
					} catch (error) {
						// Anchor missing or corrupted — let the schedule
						// board's own postOrEdit flow handle it on its
						// next refresh. We do NOT post a new intro here
						// because that would compete with ScheduleBoard's
						// own recovery path.
						const code = error instanceof DiscordAPIError ? error.code : null;
						if (code === 10008 || code === 10003) {
							console.warn(LOG_MESSAGES.setup.introRefreshReposting(spec.displayName, guild.id));
						} else {
							console.warn(LOG_MESSAGES.setup.introRefreshEditFailed(spec.displayName, guild.id), error);
						}
					}
				}
				continue;
			}

			// ── post-on-change policy for every OTHER spec ─────────
			// Owner's rule (2026-04-24): never edit, never delete
			// messages in intro channels. When copy changes, post a
			// NEW message below the old one, unpin the old, pin the
			// new. The old message remains in channel history so the
			// audit trail is preserved. Diff check prevents noise on
			// boots where nothing actually changed.
			//
			// Schedule channel is the only exception (handled above).

			// Which channels should have their intro pinned at all?
			// These are the channels where the intro is a permanent
			// reference a mortal or admin might scroll back to.
			const shouldBePinned =
				spec.configField === "commandsChannelId" ||
				spec.configField === "nextDecreeChannelId";

			// Try to fetch the stored message. If present, compare its
			// embed to the fresh one; if equivalent, we are done for
			// this spec.
			let storedMessage: Message | null = null;
			if (storedMessageId) {
				storedMessage = await channel.messages.fetch(storedMessageId).catch(() => null);
				if (storedMessage && GuildSetupManager.embedsAreEquivalent(embed, storedMessage.embeds[0])) {
					// No change — backfill pin if the invariant says
					// this channel should be pinned but the stored
					// message somehow lost its pin.
					if (shouldBePinned && !storedMessage.pinned) {
						try {
							await storedMessage.pin();
						} catch (pinError) {
							console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(guild.id), pinError);
						}
					}
					continue;
				}
			}

			// Copy differs (or stored message is gone). Before posting
			// a brand new message, scan the last 20 bot-authored
			// messages in this channel for one whose embed already
			// matches the fresh copy. If found, adopt it — someone
			// (this bot on an earlier boot, a racing tick, etc.) has
			// already posted the current copy and we should not
			// duplicate it. This is the answer to question 4 in the
			// 2026-04-24 policy thread.
			const selfId = guild.client.user?.id;
			const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
			const existingMatch = recent?.find((msg) => {
				if (!selfId || msg.author.id !== selfId) return false;
				if (msg.embeds.length === 0) return false;
				return GuildSetupManager.embedsAreEquivalent(embed, msg.embeds[0]);
			});

			if (existingMatch) {
				// Adopt the existing matching message. Persist its id,
				// ensure it is pinned when the spec calls for it, and
				// unpin the previously tracked message if it was pinned
				// and is no longer the canonical one.
				if (shouldBePinned && !existingMatch.pinned) {
					try {
						await existingMatch.pin();
					} catch (pinError) {
						console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(guild.id), pinError);
					}
				}
				if (storedMessage && storedMessage.id !== existingMatch.id && storedMessage.pinned) {
					try {
						await storedMessage.unpin();
					} catch (unpinError) {
						console.warn(LOG_MESSAGES.setup.introRefreshEditFailed(spec.displayName, guild.id), unpinError);
					}
				}
				nextIntroIds[spec.configField] = existingMatch.id;
				needsPersist = true;
				edited += 1;
				continue;
			}

			// Genuinely new content. Post a fresh message, unpin the
			// old (if pinned), pin the new, persist. If the post
			// fails, log and bail — we do NOT fall back to editing
			// because the owner's policy forbids it. Next boot will
			// retry cleanly.
			try {
				const message = await channel.send({ embeds: [embed], components: componentRows ?? [] });
				if (shouldBePinned) {
					try {
						await message.pin();
					} catch (pinError) {
						console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(guild.id), pinError);
					}
				}
				// Unpin the previous anchor (if one existed AND it was
				// pinned) so only the newest canonical message wears
				// the pin. We do NOT delete the old message — it stays
				// in channel history per the "nothing hidden" policy.
				if (storedMessage && storedMessage.pinned) {
					try {
						await storedMessage.unpin();
					} catch (unpinError) {
						console.warn(LOG_MESSAGES.setup.introRefreshEditFailed(spec.displayName, guild.id), unpinError);
					}
				}
				nextIntroIds[spec.configField] = message.id;
				needsPersist = true;
				reposted += 1;
			} catch (error) {
				// Post failure is the one place we MUST skip and retry
				// next boot. Do not delete anything, do not fall back
				// to editing. The old message stays in place, still
				// pinned, still tracked.
				console.warn(LOG_MESSAGES.setup.introRefreshEditFailed(spec.displayName, guild.id), error);
			}
		}

		// ── admin command guide (second tracked message in admin channel) ──
		// What:  #inner-sanctum hosts TWO tracked messages — the welcome
		//        embed (handled in the spec loop above under
		//        adminChannelId) and the command guide (handled here).
		//        Tracking for the second message lives on
		//        introMessageIds.adminCommandGuideId because the spec
		//        loop is keyed by channel id field, not by tracked
		//        message. Rather than refactor CHANNEL_SPECS into a
		//        message-centric shape, we run the post-on-change flow
		//        inline for this one extra message.
		// Who:   every setup-complete guild on every boot.
		// When:  after the main spec loop so the admin channel exists
		//        and its overwrites are fresh.
		// Where: follows the same "never edit, never delete" policy as
		//        the spec loop above. When copy changes, post new, pin
		//        new, unpin old, leave the old message in channel
		//        history.
		// How:   reuse the same nextIntroIds object so the batched
		//        guildConfigStore.update below captures both the
		//        channel-keyed ids AND the admin command guide id in
		//        one write.
		const adminChannelId = stored.adminChannelId as string | null | undefined;
		if (adminChannelId) {
			const adminChannel = await client.channels.fetch(adminChannelId).catch(() => null);
			if (adminChannel instanceof TextChannel) {
				const adminGuideEmbed = ChannelContent.adminCommandGuide();
				const storedAdminGuideId = nextIntroIds.adminCommandGuideId;

				// Fetch the stored message (if any) so we can diff against
				// it and, if a new copy needs to be posted, unpin the old
				// one in the same pass.
				let storedGuideMessage: Message | null = null;
				if (storedAdminGuideId) {
					storedGuideMessage = await adminChannel.messages
						.fetch(storedAdminGuideId)
						.catch(() => null);
				}

				// Short circuit: stored message exists AND its embed
				// matches the fresh one. Backfill pin if needed, move on.
				if (storedGuideMessage && GuildSetupManager.embedsAreEquivalent(adminGuideEmbed, storedGuideMessage.embeds[0])) {
					if (!storedGuideMessage.pinned) {
						try {
							await storedGuideMessage.pin();
						} catch (pinError) {
							console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(guild.id), pinError);
						}
					}
				} else {
					// Copy differs OR no stored anchor. Before posting,
					// scan the channel for a bot-authored message that
					// ALREADY matches the fresh embed — this is the
					// idempotency guard that prevents a second post when
					// something already landed the current copy this
					// boot cycle.
					const selfId = guild.client.user?.id;
					const recent = await adminChannel.messages.fetch({ limit: 20 }).catch(() => null);
					const existingMatch = recent?.find((msg) => {
						if (!selfId || msg.author.id !== selfId) return false;
						if (msg.embeds.length === 0) return false;
						return GuildSetupManager.embedsAreEquivalent(adminGuideEmbed, msg.embeds[0]);
					});

					if (existingMatch) {
						if (!existingMatch.pinned) {
							try {
								await existingMatch.pin();
							} catch (pinError) {
								console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(guild.id), pinError);
							}
						}
						if (storedGuideMessage && storedGuideMessage.id !== existingMatch.id && storedGuideMessage.pinned) {
							try {
								await storedGuideMessage.unpin();
							} catch (unpinError) {
								console.warn(LOG_MESSAGES.setup.introRefreshEditFailed("admin command guide", guild.id), unpinError);
							}
						}
						nextIntroIds.adminCommandGuideId = existingMatch.id;
						needsPersist = true;
						edited += 1;
					} else {
						// Genuinely new content. Post fresh, pin new,
						// unpin old. Never delete; the old guide stays
						// in channel history as an audit trail of past
						// command surface.
						try {
							const message = await adminChannel.send({ embeds: [adminGuideEmbed] });
							try {
								await message.pin();
							} catch (pinError) {
								console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(guild.id), pinError);
							}
							if (storedGuideMessage && storedGuideMessage.pinned) {
								try {
									await storedGuideMessage.unpin();
								} catch (unpinError) {
									console.warn(LOG_MESSAGES.setup.introRefreshEditFailed("admin command guide", guild.id), unpinError);
								}
							}
							nextIntroIds.adminCommandGuideId = message.id;
							needsPersist = true;
							reposted += 1;
						} catch (error) {
							// Post failed — log and retry next boot.
							// Old message + pin stay intact.
							console.warn(LOG_MESSAGES.setup.introRefreshEditFailed("admin command guide", guild.id), error);
						}
					}
				}
			}
		}

		if (needsPersist) {
			// single write captures every repost. update covers both the new
			// intro ids and, for a reposted schedule intro, the
			// scheduleMessageId (kept in sync so ScheduleBoard does not see
			// a dangling pointer).
			const update: Record<string, unknown> = { introMessageIds: nextIntroIds };
			if (nextIntroIds.scheduleChannelId && stored.introMessageIds?.scheduleChannelId !== nextIntroIds.scheduleChannelId) {
				update.scheduleMessageId = nextIntroIds.scheduleChannelId;
			}
			await guildConfigStore.update(guild.id, update);
		}

		console.log(LOG_MESSAGES.setup.introRefreshDone(guild.id, edited, reposted));
		return { edited, reposted };
	}
}
