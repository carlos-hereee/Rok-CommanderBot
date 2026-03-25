
export const BOT_CONSTANTS = {

    // reminder
    DEFAULT_REMINDER_OFFSETS: [30, 15],       // minutes before event to send reminders
    EVENT_WINDOW_MINUTES: 60,                  // how long after start time the event is considered "active"
    // used by ActivityTracker to know when to track voice

    // participation scoring weights
    SCORE_WEIGHTS: {
        ACKNOWLEDGED_REMINDER: 10,
        WAS_ONLINE_AT_START: 20,
        JOINED_VOICE: 30,
        VOICE_MINUTE_BONUS: 1,               // per minute in VC
        MAX_VOICE_BONUS: 60,              // cap so one player cant dominate just by idling
    },

    // default prep steps applied to every new event
    // admin can override these per event later
    DEFAULT_PREP_STEPS: [
        { label: "Activate stats token", order: 1 },
        { label: "Fetch rune buff", order: 2 },
        { label: "Use army expansion", order: 3 },
    ],

    // scheduler
    SCHEDULER_CRON: "* * * * *",              // every minute
    REMINDER_FIRE_WINDOW_MS: 60_000,          // how close to reminder time before we fire it

} as const;  // ← this is important, explained below