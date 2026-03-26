# Rise of Kingdom Discord bot

development has slowed down
This project is to help guide players learn more about the game RISE OF
KINGDOMS.

## Folder structure

```

Folder structure 

src/
├── main.ts                                   ← bot entry point, registers all listeners
├── deploy-commands.ts                        ← run once to register slash commands with Discord
│
├── types/
│   └── global.d.ts                           ← extends discord.js Client with client.commands
|
├── api/                                      ← new — thin Express API layer
│   ├── server.ts                             ← Express setup, starts alongside the bot
│   ├── middleware/
│   │   └── auth.ts                           ← simple API key auth to protect endpoints
│   └── routes/
│       ├── events.routes.ts                  ← GET/POST/DELETE /api/events
│       ├── reminders.routes.ts               ← GET /api/reminders
│       ├── players.routes.ts                 ← GET /api/players
│       └── leaderboard.routes.ts             ← GET /api/leaderboard
│
├── base/
│   ├── classes/
│   │   └── CustomClient.ts                   ← extended discord.js Client class
│   ├── interfaces/
│   │   ├── ICommand.ts                       ← shape every command file must follow
│   │   └── IClientEvent.ts                   ← shape for discord event listeners
│   └── constants/
│       └── BOT_CONSTANTS.ts                  ← default offsets, score weights, magic numbers
│
├── commands/
│   ├── utility/
│   │   ├── ping.ts                           ← /ping
│   │   └── help.ts                           ← /help
│   ├── events/
│   │   ├── create-event.ts                   ← /create-event (admin only)
│   │   ├── list-events.ts                    ← /list-events
│   │   └── delete-event.ts                   ← /delete-event (admin only)
│   └── admin/
│       └── leaderboard.ts                    ← /leaderboard shows MGE participation ranking
│
├── features/
│   ├── events/
│   │   ├── GuildEventManager.ts              ← creates, updates, deletes events in DB
│   │   ├── occurrenceCalculator.ts           ← computes next event times from interval + anchor
│   │   └── event.types.ts                    ← IGameEvent, IEventOccurrence
│   │
│   ├── reminders/
│   │   ├── ReminderScheduler.ts              ← cron loop, checks upcoming events every minute
│   │   ├── ReminderJob.ts                    ← builds embed, posts to channel, logs to DB
│   │   └── reminder.types.ts                 ← IReminderJob, IReminderConfig
│   │
│   └── activity-tracking/
│       ├── ActivityTracker.ts                ← listeners for reactions, voice, presence
│       ├── ParticipationStore.ts             ← upserts activity records, computes scores
│       └── activity.types.ts                 ← IPlayerActivity, IVoiceSession, IActivityScore
│
├── db/
│   ├── models/
│   │   ├── Event.ts                          ← event document shape + DB schema
│   │   ├── ReminderLog.ts                    ← log of every reminder that fired
│   │   └── PlayerActivity.ts                 ← per-player per-occurrence activity record
│   ├── stores/
│   │   ├── eventStore.ts                     ← all DB reads/writes for events
│   │   ├── reminderStore.ts                  ← all DB reads/writes for reminder logs
│   │   └── activityStore.ts                  ← all DB reads/writes for player activity
│   └── db.ts                                 ← connection setup, exports db instance
│
└── utils/
    ├── logger.ts                             ← structured logging wrapper
    ├── dateUtils.ts                          ← interval math, window checks, formatting
    └── embedBuilder.ts                       ← reusable Discord embed templates
  ```

## System Design

How the system will flow

```

① Admin runs /create-event
        │
        ▼
commands/events/create-event.ts         ← validates input, calls feature
        │
        ▼
features/events/GuildEventManager.ts    ← business logic
        │
        ▼
db/stores/eventStore.ts                 ← writes to DB
        │
        ▼
db/models/Event.ts                      ← document saved ✓


② main.ts starts → startScheduler() runs
        │
        ▼
features/reminders/ReminderScheduler.ts ← cron ticks every minute
        │
        ▼
features/events/occurrenceCalculator.ts ← "is an event happening in 15-30min?"
        │
        ├── NO  → do nothing, wait for next tick
        │
        └── YES ▼
        
features/reminders/ReminderJob.ts       ← builds embed, @here message
        │
        ├── posts to Discord channel
        │
        └── db/stores/reminderStore.ts  ← logs messageId to DB


③ Player reacts ✅ to reminder message
        │
        ▼
features/activity-tracking/
        ActivityTracker.ts              ← Events.MessageReactionAdd fires
        │
        ▼
db/stores/reminderStore.ts              ← looks up which event this messageId belongs to
        │
        ▼
db/stores/activityStore.ts              ← upserts PlayerActivity record


④ Event window opens — player joins voice
        │
        ▼
ActivityTracker.ts                      ← Events.VoiceStateUpdate fires
        │
        ├── join → cache join time in memory (Map)
        │
        └── leave → compute voiceMinutes, write to activityStore


⑤ Admin runs /leaderboard
        │
        ▼
commands/admin/leaderboard.ts
        │
        ▼
db/stores/activityStore.ts              ← fetches all PlayerActivity for event
        │
        ▼
features/activity-tracking/
        ParticipationStore.ts           ← computeScore() ranks players
        │
        ▼
utils/embedBuilder.ts                   ← formats ranked list as embed
        │
        ▼
Discord channel                         ← leaderboard posted ✓

```

## Usage

The usage for this bot will be as follows:

- Commanders - Gives optimal ways to play a specific commander. Talent trees,
  and best pairings. You have to give the first name of the commander Usage:
  !tree

- 8 Ball - Get mystical predictions for a yes or no question. Usage: !ball or
  !8ball

- Sun Tzu Quotes - Give you famous qoutes from the famous hero Sun Tzu Usage:
  !wise

- City Hall Upgrades - Learn information about city to level up Usage: !city

- Poll - Ask a polling question. Vote by emoji reaction. Question and options
  must be wrapped in double quotes. Questions with no provided options are
  treated as Yes / No / Unsure questions. Usage: !poll "Thoughtful question
  here?" "Optional Answer A" "Optional Answer B"

- Donate - Donations are not expected but are appreciated. Usage: !donate

- Castle Upgrades - Learn information about castle upgrades Usage: !castle

- Updates - Changes made in to the bot commands will be added here for Usage:
  !updates

- Rock, Paper, Scissors - Play a fun game with the bot of rock paper scissors
  Usage: !game

- Count Down - A count down an important message. The d = day(s) h = hour(s) m =
  minute(s), Usage: !cd [title_of_envent_no_spaces] [number]d [number]h
  [number]m and Usage: !countdown or !cd

## Tech Stack

This project was made with

- Discord.js
- Node.js
- Javascript
- eslint
- Typscript
