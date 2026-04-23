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
	//        introductions intro embed.
	// Who:   GuildSetupManager.populateChannels builds the button row;
	//        ChannelContent.introductionInviteButton() composes it.
	// When:  at setup time and on every refreshIntroEmbeds pass (the
	//        button rides along with the intro embed as a component row).
	// Where: production client id 639172234321199118. The permissions
	//        integer 17179962528 is the sum of the minimum bits the bot
	//        actually uses (see INVITE_PERMISSIONS breakdown below).
	//        Deliberately NOT Administrator — trust signal: the bot
	//        should never ask for more than it needs.
	// How:   permissions integer bits:
	//          View Channels        1024
	//          Manage Channels        16  (for /setup home-base creation)
	//          Send Messages        2048
	//          Embed Links         16384
	//          Read Message History 65536  (for schedule board fetch)
	//          Manage Messages       8192  (for pinning the schedule board)
	//          Add Reactions           64  (for the ✅ activity track ping)
	//          Mention Everyone 17179869184  (for role pings in reminders)
	//        sum: 17179962528
	//        Add scope=bot + applications.commands so slash commands
	//        register in every new guild automatically.
	INVITE_CLIENT_ID: "639172234321199118",
	INVITE_PERMISSIONS: "17179962528",
	INVITE_URL:
		"https://discord.com/api/oauth2/authorize?client_id=639172234321199118&permissions=17179962528&scope=bot+applications.commands",
} as const; // ← this is important, explained below
