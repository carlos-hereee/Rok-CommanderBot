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
	static async autoSetup(guild: Guild, config: ISetupConfig): Promise<void> {
		const existing = await guildConfigStore.findByGuildId(config.guildId);
		if (existing?.categoryId) return; // already constructed

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
		const { scheduleMessageId } = await GuildSetupManager.populateChannels(objects);

		await guildConfigStore.create({
			guildId: config.guildId,
			adminRoleId: null,
			memberRoleId: null,
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
			setupComplete: false,
		});
	}

	// ── Phase 1.5: self heal on wake up ───────────────────────
	// What: when the bot comes online, verify that every guild it's in has a
	//       homebase (category + six channels) that THIS bot created. If not,
	//       wipe any stale GuildConfig and run autoSetup to build a fresh one.
	// Who:  called from client.once("ready") in main.ts for each guild the
	//       bot is cached in. Never adopts a homebase the bot did not create,
	//       which matters when DB data is seeded from a sibling environment,
	//       a bot token was rotated, or the bot was kicked and re invited.
	// When: once per guild per process boot. After a rebuild path the new
	//       homebase belongs to this bot, so the next boot takes the skipped
	//       branch immediately.
	// Where: pairs with rebuildHomebase in ScheduleBoard.ts which performs
	//        the same self heal when a schedule refresh detects author
	//        mismatch at runtime. autoSetup still does the actual build.
	// How:  ① load GuildConfig. ② if missing, build fresh.
	//       ③ fetch the stored category; if gone, clear config and build.
	//       ④ fetch the stored scheduleMessageId in the stored schedule
	//          channel and compare author.id to client.user?.id. If the
	//          fetch 404s or the author is not this bot, clear config and
	//          build. This is the same ownership signal ScheduleBoard uses
	//          and the cheapest reliable one Discord exposes: there is no
	//          CategoryChannel.ownerId in the API.
	//       ⑤ otherwise, skip — the stored homebase is intact and ours.
	static async ensureHomebase(client: Client, guild: Guild): Promise<IEnsureHomebaseResult> {
		const stored = await guildConfigStore.findByGuildId(guild.id);

		// ① no config at all → never built for this guild. build fresh.
		if (!stored) {
			await GuildSetupManager.autoSetup(guild, { guildId: guild.id, ownerId: guild.ownerId });
			return { action: "built" };
		}

		// ② category gone? null from fetch catch, or a Discord 10003 on the
		//    direct fetch path. Either way the stored homebase doesn't exist.
		const category = await guild.channels.fetch(stored.categoryId).catch(() => null);
		if (!category) {
			console.warn(LOG_MESSAGES.setup.homebaseCategoryMissing(stored.categoryId, guild.id));
			await GuildSetupManager.rebuildFromStaleConfig(guild);
			return { action: "rebuilt" };
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
			return { action: "rebuilt" };
		}

		// ④ happy path: stored homebase exists and was authored by this bot.
		return { action: "skipped" };
	}

	// ── ownership probe ───────────────────────────────────────
	// What: return true iff the stored scheduleMessageId resolves and is
	//       authored by the running bot account. Any other outcome (missing
	//       channel, missing message id, message deleted, author mismatch)
	//       means the stored homebase is not ours and must be rebuilt.
	// Who:  ensureHomebase on startup. Kept as its own method so the ready
	//       path tests can drive each branch with focused mocks.
	// When: once per guild per boot, or whenever any caller wants a cheap
	//       provenance check against Discord.
	// Where: intentionally does NOT call guildConfigStore.update — callers
	//        that act on the result own the follow up writes.
	// How:  bail early on any missing piece. Swallow 10008 / 10003 /
	//       cache misses as "not ours" so a single bad fetch does not crash
	//       the ready sweep for every other guild.
	private static async isHomebaseOwnedByThisBot(
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
	// What: wipe this bot's GuildConfig row and rerun autoSetup. The OLD
	//       Discord category and channels (if they still exist) are left
	//       untouched — they may belong to another bot and we have no
	//       right to delete them.
	// Who:  ensureHomebase. Mirrors the private rebuildHomebase helper in
	//       ScheduleBoard.ts so runtime and boot time self heal take the
	//       same path.
	// When: only after ensureHomebase has positively determined the stored
	//       homebase is gone or foreign.
	// Where: autoSetup's own early return watches existing?.categoryId, so
	//        clearing the row is what lets it proceed on the second call.
	// How:  delete → autoSetup. autoSetup applies the (dev) suffix on its
	//       own when NODE_ENV=development so a rebuilt dev homebase stays
	//       visually distinct from any foreign prod category still in the
	//       guild.
	private static async rebuildFromStaleConfig(guild: Guild): Promise<void> {
		await guildConfigStore.deleteByGuildId(guild.id);
		await GuildSetupManager.autoSetup(guild, { guildId: guild.id, ownerId: guild.ownerId });
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

		const [introChannel, commandsChannel, leaderboardChannel, scheduleChannel, announcementsChannel, adminChannel] =
			await Promise.all([
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
			},
			objects: {
				introChannel,
				commandsChannel,
				leaderboardChannel,
				scheduleChannel,
				announcementsChannel,
				adminChannel,
			},
		};
	}

	// ── populate channels with initial content ────────────────
	// returns the scheduleMessageId so autoSetup can persist it. the schedule
	// channel is special: its message is the anchor for the live schedule
	// board that ScheduleBoard.refreshSchedule edits in place. pinning is
	// best effort — a missing pin does not break the feature.
	private static async populateChannels(discordChannels: IChannelObjects): Promise<{ scheduleMessageId: string }> {
		const { introChannel, commandsChannel, leaderboardChannel, scheduleChannel, announcementsChannel, adminChannel } =
			discordChannels;

		const [, , , scheduleMessage] = await Promise.all([
			introChannel.send({ embeds: [ChannelContent.introduction()] }),
			commandsChannel.send({ embeds: [ChannelContent.commandGuide()] }),
			leaderboardChannel.send({ embeds: [ChannelContent.leaderboardIntro()] }),
			scheduleChannel.send({ embeds: [ChannelContent.scheduleIntro()] }),
			announcementsChannel.send({ embeds: [ChannelContent.announcementsIntro()] }),
			adminChannel.send({ embeds: [ChannelContent.adminPending()] }),
		]);

		try {
			await scheduleMessage.pin();
		} catch (error) {
			// pin requires ManageMessages. if the bot's role lacks it the
			// board still works, the intro just floats in recent history.
			console.warn(LOG_MESSAGES.setup.pinScheduleIntroFailed(discordChannels.scheduleChannel.guildId), error);
		}

		return { scheduleMessageId: scheduleMessage.id };
	}
}
