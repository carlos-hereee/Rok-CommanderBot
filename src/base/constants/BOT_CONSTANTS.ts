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
	// Where: production client id 639172234321199118. The permissions
	//        integer 268659792 is the sum of the EXACT bits the bot uses
	//        (see breakdown below). Deliberately NOT Administrator —
	//        trust signal: the bot should never ask for more than it
	//        needs.
	// How:   permissions integer bits (all verified against
	//        discord.js PermissionFlagsBits and Discord's permission
	//        bit table):
	//          View Channel              1024  (every channel it operates in)
	//          Manage Channels             16  (autoSetup creates category + 6 child channels)
	//          Manage Roles         268435456  (write permission_overwrites on the category + admin/leaderboard)
	//          Send Messages             2048  (every embed)
	//          Manage Messages           8192  (pin schedule board)
	//          Embed Links              16384  (every embed)
	//          Read Message History     65536  (fetch stored schedule + intro message ids)
	//          Add Reactions               64  (✅ react on real activity tracker fires)
	//          Mention Everyone        131072  (role pings in reminders, go-live-soon, announce-stream)
	//        sum: 268659792
	//        scope=bot is required so the bot actually JOINS as a guild
	//        member; applications.commands registers slash commands. The
	//        50013 incident in guild 1489319190132424734 (2026-04-25)
	//        traced back to an earlier integer that omitted Manage
	//        Channels and Manage Roles — autoSetup blew up on the very
	//        first guild.channels.create call and main.ts's catch block
	//        called guild.leave(). Don't strip bits without a 5Ws check
	//        of what fails.
	INVITE_CLIENT_ID: "639172234321199118",
	INVITE_PERMISSIONS: "268659792",
	INVITE_URL:
		"https://discord.com/api/oauth2/authorize?client_id=639172234321199118&permissions=268659792&scope=bot+applications.commands",
} as const; // ← this is important, explained below
