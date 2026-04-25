export const BOT_CONSTANTS = {
	// reminder
	DEFAULT_REMINDER_OFFSETS: [30, 15], // minutes before event to send reminders
	EVENT_WINDOW_MINUTES: 60, // how long after start time the event is considered "active"
	// used by ActivityTracker to know when to track voice

	// participation scoring weights
	SCORE_WEIGHTS: {
		ACKNOWLEDGED_REMINDER: 10,
		WAS_ONLINE_AT_START: 20,
		JOINED_VOICE: 30,
		VOICE_MINUTE_BONUS: 1, // per minute in VC
		MAX_VOICE_BONUS: 60, // cap so one player cant dominate just by idling
	},

	// default prep steps applied to every new event
	// admin can override these per event later
	DEFAULT_PREP_STEPS: [
		{ label: "Activate stats token", order: 1 },
		{ label: "Fetch rune buff", order: 2 },
		{ label: "Use army expansion", order: 3 },
	],

	// ── admin commands that require role check ────────────────────
	// /list-events and /leaderboard are deliberately NOT in this set —
	// both are read-only and were moved to the public #command-center
	// when the public/admin command guide split landed on 2026-04-24.
	// Mortals seeing their rank and what's scheduled is the whole point.
	// New admin streamer commands (configure-stream-schedule,
	// pause-schedule, continue-schedule, go-live-soon, announce-stream)
	// are gated because they write state.
	ADMIN_COMMANDS: new Set<string>([
		"configure-kvk-season",
		"delete-event",
		"configure-stream-schedule",
		"pause-schedule",
		"continue-schedule",
		"go-live-soon",
		"announce-stream",
	]),
	// scheduler
	SCHEDULER_CRON: "* * * * *", // every minute
	REMINDER_FIRE_WINDOW_MS: 60_000, // how close to reminder time before we fire it

	// ── reminder log sentinel offsets ──────────────────────────────
	// offsetMinutes values that aren't real "N minutes before event" markers.
	// these exist so the compound unique index on
	// { eventId, eventOccurrence, offsetMinutes } stays honest even for
	// non-standard fires (season end announcements, dashboard test fires).
	REMINDER_LOG_OFFSETS: {
		SEASON_END: -1, // used by ReminderScheduler when announcing end of season
		TEST: -2, // used by test reminder fires dispatched from the dashboard
	},

	// ── dashboard test reminder ───────────────────────────────────
	// rate limit so a jumpy admin cannot spam their alliance channel
	TEST_REMINDER_COOLDOWN_MS: 60_000, // one test per event per 60 seconds

	// ── public invite URL ─────────────────────────────────────────
	// What:  the OAuth2 authorize URL mortals use to invite ROK Commander
	//        into their own server. Rendered as a link button under the
	//        introductions intro embed and shipped to alliance leads who
	//        want to install the bot manually.
	// Who:   GuildSetupManager.populateChannels builds the button row;
	//        ChannelContent.introductionInviteButton() composes it.
	// When:  at setup time and on every refreshIntroEmbeds pass (the
	//        button rides along with the intro embed as a component row).
	// Where: production client id 639172234321199118. Permissions integer
	//        is 8 (Administrator).
	// Why:   the bot creates a private homebase category with @everyone
	//        deny ViewChannel on the admin channel and @everyone deny
	//        SendMessages on public channels, so only the bot/owner write
	//        the intros, schedule board, reminders, etc. Discord's
	//        permission enforcement on `POST /guilds/.../channels`
	//        rejects 50013 when the bot tries to grant itself a
	//        permission via member overwrite that @everyone denies in
	//        the same call (the bot would gain the permission only AFTER
	//        its overwrite is applied, but Discord checks BEFORE). Tried
	//        and failed in 2026-04-25 production rollout: minimum-bits
	//        invite URL with bot member overwrites in createChannels.
	//        Tried again with @everyone deny dropped from category: same
	//        failure on the public child channels because the same check
	//        applies there. Switched to Administrator on 2026-04-25 to
	//        ship; tech-debt item is to refactor channel creation to use
	//        the bot's integration ROLE overwrite (`guild.members.me
	//        .roles.botRole`) instead of member overwrite, which sits in
	//        a different permission tier and may avoid the catch-22.
	// How:   permissions integer 8 = ADMINISTRATOR. Bypasses every
	//        channel-level overwrite check, including the granting one.
	//        Trade-off: the install screen says "Administrator," which
	//        is a yellow flag for security-aware server admins. Mitigate
	//        by being transparent in the install docs about exactly what
	//        permissions the bot uses (the prior bit list is preserved
	//        below in MIN_PERMISSIONS_DOCS for that purpose).
	INVITE_CLIENT_ID: "639172234321199118",
	INVITE_PERMISSIONS: "8",
	INVITE_URL:
		"https://discord.com/oauth2/authorize?client_id=639172234321199118&permissions=8&integration_type=0&scope=bot+applications.commands",
	// ── minimum perms documentation ──────────────────────────────
	// What:  the explicit list of permissions the bot actually uses,
	//        kept here for install-doc honesty. Even though we ship
	//        Administrator, server owners can audit this list to see
	//        what the bot will actually do. This is also the target
	//        set if/when the integration-role refactor lands and we
	//        can drop Administrator.
	// Who:   anyone reading the bot's README or install guide. Not
	//        consumed by code today.
	// How:   bit names match discord.js PermissionFlagsBits. Sum is
	//        268659792 (the integer we'd use without the Discord
	//        enforcement catch-22).
	MIN_PERMISSIONS_DOCS: [
		"View Channel",
		"Manage Channels",
		"Manage Roles",
		"Send Messages",
		"Manage Messages",
		"Embed Links",
		"Read Message History",
		"Add Reactions",
		"Mention Everyone",
	] as const,
} as const; // ← this is important, explained below
