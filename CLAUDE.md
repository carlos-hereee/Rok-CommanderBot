# ROK Commander Bot

## Owner
qwerty (97hernandez.c@gmail.com)
Portfolio: https://www.companyuno.com

## What this is
A Discord bot for Rise of Kingdoms alliances. TypeScript, ESM only, Discord.js v14, Mongoose on MongoDB Atlas, Express HTTP API for a dashboard.

Key domains under `src/features/`:

| Folder | Purpose |
|--------|---------|
| `setup/` | Auto builds the guild's home base (category + six channels) when the bot joins, then applies admin and member roles when `/setup` runs. |
| `events/` | Event data model, occurrenceCalculator (pure math), GuildEventManager (creates ROK KvK season events). |
| `reminders/` | ReminderScheduler (cron), ReminderJob (fires real reminders), TestReminderJob (dashboard test fires). |
| `schedule/` | ScheduleBoard — keeps a pinned message in the event-schedule channel in sync with active events. |
| `activity-tracking/` | Tracks voice minutes and reaction acks for participation scoring. |
| `university/` | Commander build lookups (talents, tree guides). |

`src/api/` has middleware, routes, and the Express server. `src/db/` has Mongoose models and thin store wrappers. `src/base/` has constants and types.

## Commands and scripts

```
npm install         # triggers postinstall (tsc + tsc-alias)
npm run build       # clean + tsc + tsc-alias
npm run development # nodemon on dist/, NODE_ENV=development
npm run deploy      # registers slash commands with Discord
npm test            # vitest (watch)
npm run test:run    # vitest (single run)
npm run test:coverage
```

## Path aliases (tsconfig)

```
@utils/*     -> ./src/utils/*
@base/*      -> ./src/base/*
@api/*       -> ./src/api/*
@features/*  -> ./src/features/*
@commands/*  -> ./src/commands/*
@db/*        -> ./src/db/*
```

`baseUrl` was deprecated in TypeScript 6.0; paths are declared relative to `tsconfig.json` directly.

Source files import with the `.js` suffix (`import { X } from "@features/foo/bar.js"`) because the bot is pure ESM with `moduleResolution: "bundler"`. Vitest resolves the suffix back to `.ts` via `vite-tsconfig-paths`.

## Critical invariants

1. Channel resolution is guild wide. Reminders post to `guildConfig.announcementsChannelId`. There is no per event channel override and the dashboard form must not reintroduce one.
2. Guild scoping is a security boundary. Missing `guildId` returns 400. A resource that exists but belongs to another guild returns 404, never 403 (prevents existence leakage).
3. Test reminder fires use `offsetMinutes: BOT_CONSTANTS.REMINDER_LOG_OFFSETS.TEST` (-2) as the sentinel so they do not collide with the compound unique index on real fires. They also use `allowedMentions: { parse: [], roles: [], users: [] }` so the role mention renders but does not actually ping.
4. The test fire route has a 60 second per event per guild cooldown enforced in memory in the route handler.
5. `fireReminder` pings `config.memberRoleId`. Fallback to `@here` only when the guild is a legacy config without a member role assigned.

## Schedule board

A pinned message in the `📅event-schedule` channel that reflects the live state of active events. One message per guild, anchored by `GuildConfig.scheduleMessageId`, edited in place.

Refresh triggers:

Event CRUD (`POST/PATCH/DELETE /api/events`), `GuildEventManager.configureKvKSeason`, every `fireReminder` call so "next occurrence" advances visibly, `announceSeasonEnd` to swap to the ended state, bot startup via `refreshAllSchedules(client)` in `main.ts`, and an hourly cron tick in `ReminderScheduler.startScheduler`.

Recovery: if the stored message was deleted by an admin, the next refresh reposts and updates the stored id. Pinning is best effort; a missing pin does not break the feature.

## Conventions and rules for working on this codebase

1. Never use dashes in chat replies (the owner's preference).
2. Do NOT run `npx tsc --noEmit`, `npm run build`, or anything that triggers `tsc`. The owner builds manually before deploy. `npm install` does run `tsc` via postinstall — prefer writing files and asking the owner to run the install.
3. Comment complicated logic. Every non trivial branch, algorithm, invariant, or workaround should have an inline comment. Complex comments must answer the relevant 5Ws (Who, What, When, Where, How) adapted to code:
   - What: what this block does in one line
   - Who: which callers or downstream consumers are affected
   - When: the runtime conditions that make this branch execute (timing, state, inputs)
   - Where: how this piece fits into the surrounding system (upstream caller, downstream effect)
   - How: the mechanism or algorithm, especially when non obvious
   Not every comment needs all five. Function or module level comments should cover most of them. Inline comments on a single line can focus on the one or two that matter. Trivial wiring does not need comments; anything requiring a second read does. Match the existing voice: prose explanations, numbered steps (①②③) for multi phase functions, section markers (// ── Section ──) for major groups.
4. Tests live colocated next to the module (`src/features/events/occurrenceCalculator.test.ts` next to `occurrenceCalculator.ts`). Vitest picks them up via `src/**/*.test.ts`, and the main tsconfig excludes them so they never compile into `dist/`.
5. When adding user facing copy that warriors see in Discord, route it through `src/base/constants/embed-content.ts`. Keep the medieval kingdom voice (castle, scroll, shield, "Summon New Event", "The kingdom rests"). Admin facing ephemeral copy can be more practical.
6. Stores (`src/db/stores/*`) are thin Mongoose wrappers. Business logic belongs in feature modules, not in stores. Do not test store methods.
7. Discord side effects in a feature should be fire and forget when they follow a successful primary action (for example, schedule refreshes after reminder fires). Log errors, never throw back into the caller.
8. The bot is ESM. All local imports must carry the `.js` suffix even though the source is `.ts`.

## Tech debt

- `TestReminderJob.ts` uses `Object.create(TextChannel.prototype)` inside tests to fake a TextChannel. If discord.js tightens its class internals this will need a `vi.mock("discord.js", ...)` swap.
- The `_moduleAliases` block in `package.json` is runtime alias mapping for compiled JS. tsc-alias already rewrites aliases at build time, so the runtime mapping is likely redundant now. Low priority cleanup.

## Session continuity checklist
1. Read this file.
2. Read the testing strategy in the sibling `company-uno` repo at `rok-commander-testing-strategy.md` if test work is on the table.
3. Remember that the dashboard lives in `company-uno/nexious-client/src/features/plugin-modules/` and has its own CLAUDE.md at the company-uno root.
