// ── LOG_MESSAGES ──────────────────────────────────────────────────────
// What:  single source of truth for every console.log / console.warn /
//        console.error string the bot emits.
// Who:   every feature module, every route handler, the bot entry point.
// When:  caller imports LOG_MESSAGES and passes the function result or
//        constant to console.*.
// Where: paired with embedContent for user-facing copy. console output
//        lives here; Discord-rendered copy lives in embed-content.ts.
// How:   strings with no interpolation are exported as string constants.
//        strings that take runtime values are exported as arrow functions
//        so the tag prefix and phrasing stay consistent per namespace.
//        error objects are still passed as a second argument to console
//        so stack traces survive.
//
// Usage:
//   import { LOG_MESSAGES } from "@base/constants/log-messages.js";
//   console.error(LOG_MESSAGES.schedule.editFailed(id, guildId), error);
export const LOG_MESSAGES = {
	// ── schedule board ─────────────────────────────────────────────────
	schedule: {
		channelMissing: (channelId: string, guildId: string) =>
			`[schedule] schedule channel ${channelId} not found or not a TextChannel for guild ${guildId}`,
		unexpectedError: (guildId: string) => `[schedule] unexpected error refreshing guild ${guildId}:`,
		storedMessageDeleted: (messageId: string, guildId: string) =>
			`[schedule] stored scheduleMessageId ${messageId} was deleted for guild ${guildId}. reposting.`,
		editFailed: (messageId: string, guildId: string) =>
			`[schedule] failed to edit scheduleMessageId ${messageId} for guild ${guildId}:`,
		staleAuthor: (messageId: string, guildId: string) =>
			`[schedule] scheduleMessageId ${messageId} in guild ${guildId} is not authored by this bot. treating the whole homebase as stale.`,
		rebuildingHomebase: (guildId: string) =>
			`[schedule] rebuilding homebase for guild ${guildId} — deleting stale GuildConfig and running autoSetup to create fresh channels this bot owns.`,
		rebuildHomebaseFailed: (guildId: string) =>
			`[schedule] homebase rebuild for guild ${guildId} failed. bot will retry on the next refresh trigger.`,
		postFailed: (guildId: string) => `[schedule] failed to post schedule message for guild ${guildId}:`,
		pinFailed: (guildId: string) => `[schedule] pin failed for guild ${guildId} (likely missing ManageMessages):`,
		refreshAfterConfigureFailed: "[schedule] refresh after configureKvKSeason failed:",
		refreshAfterRouteFailed: (trigger: string) => `[schedule] refresh after ${trigger} failed:`,
		refreshAfterReminderFailed: "[schedule] refresh after fireReminder failed:",
		refreshAfterSeasonEndFailed: "[schedule] refresh after announceSeasonEnd failed:",
		hourlyRefreshFailed: "[schedule] hourly refreshAllSchedules failed:",
	},

	// ── reminder firing ────────────────────────────────────────────────
	reminder: {
		noAnnouncementsChannel: (guildId: string) =>
			`[reminder] no announcements channel configured for guild ${guildId} — skipping fire`,
		channelNotFound: (channelId: string) => `Channel ${channelId} not found or not a text channel`,
	},

	// ── test reminder firing ───────────────────────────────────────────
	testReminder: {
		fetchChannelFailed: (channelId: string) => `[test-reminder] failed to fetch channel ${channelId}:`,
		postFailed: (channelId: string) => `[test-reminder] failed to post to channel ${channelId}:`,
		logWriteFailedAfterPost: "[test-reminder] embed posted but log write failed:",
	},

	// ── reminder scheduler ─────────────────────────────────────────────
	scheduler: {
		tickError: "Scheduler error:",
		seasonEndNoChannel: (guildId: string) => `[season-end] no channel available for guild ${guildId}`,
		seasonEndFailed: "Failed to announce season end:",
	},

	// ── setup ──────────────────────────────────────────────────────────
	setup: {
		pinScheduleIntroFailed: (guildId: string) => `[setup] failed to pin schedule intro message for guild ${guildId}:`,
		commandFailed: "Setup failed:",
		// ensureHomebase self heal path on wake up. emitted from
		// GuildSetupManager.ensureHomebase when the stored category cannot be
		// fetched (deleted, moved, or never existed on this Discord side).
		homebaseCategoryMissing: (categoryId: string, guildId: string) =>
			`[setup] stored categoryId ${categoryId} missing for guild ${guildId}. rebuilding homebase.`,
		// emitted when the stored scheduleMessageId is authored by a different
		// bot or cannot be resolved. tells the operator we are NOT going to
		// touch the existing channels — we will build a parallel homebase
		// this bot owns.
		homebaseNotOwned: (guildId: string) =>
			`[setup] homebase for guild ${guildId} is not owned by this bot. rebuilding instead of adopting.`,
		// probe failures during ownership check. Discord error code (number)
		// or "unknown" for non DiscordAPIError throws.
		homebaseOwnershipProbeFailed: (guildId: string, code: number | string) =>
			`[setup] ownership probe failed for guild ${guildId} (code ${code}). treating homebase as not owned.`,
	},

	// ── guild event manager ────────────────────────────────────────────
	guildEvent: {
		configureKvkFailed: "Failed to configure KvK season:",
	},

	// ── main / entry point ─────────────────────────────────────────────
	main: {
		commandLoadWarning: (filePath: string) =>
			`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
		autoSetupFailedLeaving: (guildId: string) => `Auto-setup failed for guild ${guildId}, leaving:`,
		leaveFailed: (guildId: string) => `Failed to leave guild ${guildId}:`,
		noCommandMatch: (commandName: string) => `No command matching ${commandName} was found.`,
		commandExecuteError: (commandName: string) => `Error executing ${commandName}:`,
		autoSetupFailedSkipping: (guildId: string) => `Auto-setup failed for guild ${guildId}, skipping:`,
		readyBanner: (tag: string) =>
			"====================================\n" + `🤖 ${tag} is online and operational!\n` + "====================================",
	},

	// ── db ─────────────────────────────────────────────────────────────
	db: {
		missingUri: "[ERROR] MONGOOSE_URI environment variable is not set.",
		connected: "\n\n✅ Connected to MongoDB",
	},

	// ── api ────────────────────────────────────────────────────────────
	api: {
		// port is typed as `string | number` upstream (env var may be a string literal,
		// config fallback is a numeric literal), so both are accepted here. template
		// interpolation coerces either into the rendered output cleanly.
		serverRunning: (port: number | string) => `API server running on port ${port}`,
		errorFindingEvents: "\n\nerror occurred finding events ==>",
		errorFindingEvent: "\n\nerror occurred finding event ==>",
		errorCreatingEvent: "\n\nerror occurred creating event ==>",
		errorUpdatingEvent: "\n\nerror occurred updating event ==>",
		errorDeletingEvent: "\n\nerror occurred deleting event ==>",
		errorTestReminder: "\n\nerror occurred firing test reminder ==>",
		errorFindingLeaderboard: "\n\nerror occurred finding leaderboard ==>",
		errorFindingReminders: "\n\nerror occurred finding reminders ==>",
		errorFindingPlayers: "\n\nerror occurred finding players ==>",
		errorFindingPlayerActivity: "\n\nerror occurred finding player activity ==>",
		// callers append this to the error log so the original \n\nerror X ==> ... \n\n wrap is preserved.
		errorSuffix: "\n\n",
	},

	// ── deploy commands script ─────────────────────────────────────────
	deploy: {
		commandLoadWarning: (filePath: string) =>
			`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
		missingCredentials: "[ERROR] Missing required environment variables: DISCORD_CLIENT_ID or DISCORD_TOKEN.",
		missingGuildId: "[ERROR] Missing DISCORD_GUILD_ID — required for development guild-scoped deployment.",
		refreshing: (count: number, scope: "GLOBAL" | "GUILD") => `Refreshing ${count} application (/) commands [${scope}]...`,
		globalSuccess: (count: number) => `Successfully reloaded ${count} global application (/) commands.`,
		globalPropagationNote: "Note: global commands can take up to 1 hour to propagate across all servers.",
		guildSuccess: (count: number) => `Successfully reloaded ${count} guild application (/) commands.`,
	},

	// ── activity tracking ──────────────────────────────────────────────
	activity: {
		reactionError: "Reaction tracking error:",
		voiceError: "Voice tracking error:",
		presenceError: "Presence tracking error:",
	},

	// ── ready / startup ────────────────────────────────────────────────
	ready: {
		loggedInAs: (tag: string) => `\n\nReady! Logged in as ${tag}\n`,
	},
} as const;
