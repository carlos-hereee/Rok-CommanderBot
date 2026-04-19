import { Guild, PermissionFlagsBits, ChannelType, CategoryChannel, GuildChannel, Client, TextChannel, DiscordAPIError } from "discord.js";
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
	): import("discord.js").EmbedBuilder {
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
		const newChannel = await GuildSetupManager.buildSingleChannel(guild, category, spec.displayName, spec.kind, stored.adminRoleId ?? null);

		// repost intro. failures here are non fatal — the channel exists and
		// the bot is functional; the intro is cosmetic. Capture the new
		// message id so we can persist it on introMessageIds[configField];
		// without this the next boot's refreshIntroEmbeds has no anchor and
		// would repost a second intro, accumulating clutter over time.
		let introMessageId: string | null = null;
		try {
			const introMessage = await newChannel.send({
				embeds: [GuildSetupManager.resolveIntroEmbed(spec.configField, guild, stored.adminRoleId ?? null)],
			});
			introMessageId = introMessage.id;
			// schedule channel's intro doubles as the pinned board anchor —
			// repin on repair to preserve that invariant.
			if (spec.configField === "scheduleChannelId") {
				try {
					await introMessage.pin();
				} catch (pinError) {
					console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(guild.id), pinError);
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
			if (!storedId) continue;

			// resolve the channel. null (cache miss) and fetch throws both
			// mean rebuild. misconfigured-but-present channels are out of
			// scope for boot time self heal.
			const existing = await guild.channels.fetch(storedId).catch(() => null);
			if (existing) continue;

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

		const [introMsg, commandsMsg, leaderboardMsg, scheduleMessage, announcementsMsg, adminMsg, nextDecreeMsg] = await Promise.all([
			introChannel.send({ embeds: [ChannelContent.introduction()] }),
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
		const nextIntroIds: Record<string, string | null> = {
			introChannelId: stored.introMessageIds?.introChannelId ?? null,
			commandsChannelId: stored.introMessageIds?.commandsChannelId ?? null,
			leaderboardChannelId: stored.introMessageIds?.leaderboardChannelId ?? null,
			scheduleChannelId: stored.introMessageIds?.scheduleChannelId ?? null,
			announcementsChannelId: stored.introMessageIds?.announcementsChannelId ?? null,
			adminChannelId: stored.introMessageIds?.adminChannelId ?? null,
			// legacy rows predating the seventh channel have this as null.
			// refreshIntroEmbeds then treats it like any other missing
			// anchor — reposts a fresh intro the first time the channel
			// is present and persists the new id.
			nextDecreeChannelId: stored.introMessageIds?.nextDecreeChannelId ?? null,
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
			const storedMessageId = nextIntroIds[spec.configField];

			// ── path A: we have a stored anchor → try edit in place ──
			if (storedMessageId) {
				try {
					const message = await channel.messages.fetch(storedMessageId);
					await message.edit({ embeds: [embed] });
					edited += 1;
					continue;
				} catch (error) {
					// 10008 Unknown Message or 10003 Unknown Channel → the
					// anchor is gone. fall through to the repost path.
					// 50005 (author mismatch) is a corruption signal; log and
					// skip so ensureHomebase can sort it on the next pass.
					const code = error instanceof DiscordAPIError ? error.code : null;
					if (code === 50005) {
						console.warn(LOG_MESSAGES.setup.introRefreshEditFailed(spec.displayName, guild.id), error);
						continue;
					}
					if (code !== 10008 && code !== 10003) {
						// transient failure (rate limit / outage / perms).
						// skip this channel so the rest still refresh.
						console.warn(LOG_MESSAGES.setup.introRefreshEditFailed(spec.displayName, guild.id), error);
						continue;
					}
					// fall through to the repost path below.
					console.warn(LOG_MESSAGES.setup.introRefreshReposting(spec.displayName, guild.id));
				}
			}

			// ── path B: no anchor or anchor gone → repost + persist ──
			try {
				const message = await channel.send({ embeds: [embed] });
				// schedule channel gets the same repin treatment as the
				// initial build so the board anchor stays pinned.
				if (spec.configField === "scheduleChannelId") {
					try {
						await message.pin();
					} catch (pinError) {
						console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(guild.id), pinError);
					}
				}
				nextIntroIds[spec.configField] = message.id;
				needsPersist = true;
				reposted += 1;
			} catch (error) {
				console.warn(LOG_MESSAGES.setup.introRefreshEditFailed(spec.displayName, guild.id), error);
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
