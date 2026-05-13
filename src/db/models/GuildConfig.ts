import mongoose from "mongoose";
import { v4 } from "uuid";

const Schema = mongoose.Schema;

const guildConfigSchema = new Schema(
	{
		configId: { type: String, required: true, unique: true, default: v4 },
		guildId: { type: String, required: true, unique: true },
		adminRoleId: { type: String, required: false, default: null }, // role that can configure the bot

		// category
		categoryId: { type: String, required: true },
		// member role assigned to verified users during onboarding — stored here for easy access when assigning during onboarding
		memberRoleId: { type: String, required: false, default: null },
		// channel IDs — stored so bot always knows where to post.
		// All channels stay required because v1.5.1 ships the visibility-
		// toggle approach (channels always exist, /setup hide/show controls
		// @everyone ViewChannel overwrites). A future create-or-delete
		// redesign would re-revisit nullability.
		introChannelId: { type: String, required: true },
		commandsChannelId: { type: String, required: true },
		leaderboardChannelId: { type: String, required: true },
		scheduleChannelId: { type: String, required: true },
		announcementsChannelId: { type: String, required: true },
		adminChannelId: { type: String, required: true },
		// ── next decree channel ───────────────────────────────────────
		// What:  id of the 🛡️next-decree channel where NextUpBoard posts
		//        a fresh embed for each upcoming event (24h rolling
		//        horizon). NEW posts, never edits — each post is an audit
		//        trail entry leaders can scroll back through.
		// Who:   NextUpBoard (post creation), GuildSetupManager
		//        (channel provisioning + self heal).
		// When:  populated by the first /setup or autoSetup pass that runs
		//        AFTER this field is merged. Legacy rows load with null
		//        until the boot sweep's repairMissingChannels fills it in.
		// Where: read by NextUpBoard at post time; written by
		//        populateChannels and repairOneChannel.
		// How:   nullable so existing guilds (pre this migration) still
		//        load cleanly. The boot sweep's CHANNEL_SPECS walk treats
		//        null as "missing" and rebuilds the channel on next tick.
		nextDecreeChannelId: { type: String, required: false, default: null },

		// id of the pinned message inside scheduleChannelId that ScheduleBoard
		// keeps up to date. null until autoSetup finishes posting the intro,
		// at which point this is populated and every subsequent refresh edits
		// that one message in place so the channel never accumulates clutter.
		scheduleMessageId: { type: String, required: false, default: null },

		// ── KvK season end ─────────────────────────────────────────────
		// What:  the configured end date of the guild's current KvK season.
		//        Single canonical date per guild. Events created with
		//        announcementType "kvk" inherit this value at the events
		//        route, so admins never type the same date twice.
		// Who:   written by GuildEventManager.configureKvKSeason when the
		//        owner runs /configure-kvk-season. Read by the events route
		//        when a new event opts into KvK mode, and by the dashboard
		//        health endpoint so the EventCreatePage can disable the
		//        KvK toggle when no season is configured yet.
		// When:  written once per season at /configure-kvk-season time.
		//        Cleared (back to null) when ReminderScheduler.announceSeasonEnd
		//        flips the last KvK event inactive — but ONLY if no other
		//        active KvK events still reference a future date. For v1
		//        we leave the cleanup to the next /configure-kvk-season run
		//        which overwrites the field; this avoids a multi guild race
		//        where season end rolls over while events are still firing.
		// Where: nullable so legacy guilds (any guild that has not run
		//        /configure-kvk-season since this field was added) load
		//        cleanly. The dashboard treats null as "no active season"
		//        and disables the KvK toggle on the event create form.
		// How:   stored as a Date object so the date math at the events
		//        route is symmetric with how IKvKSeasonInput already passes
		//        it around in GuildEventManager.
		kvkSeasonEnd: { type: Date, required: false, default: null },

		// ── intro message ids ──────────────────────────────────────────
		// What:  per channel id of the bot's intro embed message. Populated
		//        when populateChannels (or repairOneChannel) posts an intro,
		//        consumed by GuildSetupManager.refreshIntroEmbeds at boot to
		//        edit the existing message in place rather than reposting.
		// Who:   GuildSetupManager.populateChannels (initial), repairOneChannel
		//        (per channel rebuild), refreshIntroEmbeds (boot refresh).
		// When:  initial: set during the first /setup or autoSetup pass.
		//        rebuild: overwritten when a channel is healed.
		//        boot: read but only written if the stored message went
		//        missing and a fresh intro had to be posted.
		// Where: nested object so adding a seventh homebase channel later is
		//        a one line schema bump instead of a sibling field per slot.
		// How:   nullable per field so legacy rows that predate this change
		//        still load. refreshIntroEmbeds treats null as "no anchor,
		//        repost a fresh intro" which doubles as the migration path.
		introMessageIds: {
			type: {
				introChannelId: { type: String, required: false, default: null },
				commandsChannelId: { type: String, required: false, default: null },
				leaderboardChannelId: { type: String, required: false, default: null },
				scheduleChannelId: { type: String, required: false, default: null },
				announcementsChannelId: { type: String, required: false, default: null },
				adminChannelId: { type: String, required: false, default: null },
				// paired with nextDecreeChannelId above. tracks the intro
				// embed sitting above the NextUpBoard posts so
				// refreshIntroEmbeds edits it in place on boot.
				nextDecreeChannelId: { type: String, required: false, default: null },
				// ── admin command guide (2026-04-24) ───────────────────
				// What:  the SECOND pinned message in adminChannelId. The
				//        admin welcome embed keeps adminChannelId above;
				//        this field tracks the admin-only command guide
				//        which mortals never see because inner-sanctum is
				//        role-gated. Public #command-center now only
				//        lists /leaderboard + /list-events; every other
				//        command lives behind this guide.
				// Who:   GuildSetupManager.populateChannels (initial post),
				//        refreshIntroEmbeds (edit in place on every boot).
				// When:  populated on fresh setups shipped after this
				//        migration. Legacy rows load as null, and the
				//        refresh sweep treats null as "no anchor — post
				//        a fresh admin command guide and persist the id,"
				//        which doubles as the migration path.
				// Where: breaks the one-key-per-channel invariant of this
				//        sub-doc. Accepted as tech debt: the alternative
				//        (restructuring adminChannelId to a sub-object)
				//        would require a breaking migration touching
				//        every live row. Flat keys scale — add another
				//        for the next second-message-in-a-channel use
				//        case and move on.
				// How:   nullable string, same contract as every sibling.
				adminCommandGuideId: { type: String, required: false, default: null },
			},
			required: false,
			default: () => ({}),
		},

		setupComplete: { type: Boolean, default: false },

		// ── plugin id (streamer-plugin spec Phase 1) ───────────────────
		// What:  which copy/voice pack the bot renders for this guild.
		//        Today the registry knows two ids: "rok-commander" (the
		//        kingdom-voice pack used by the original alliance bot) and
		//        "general-events" (the streamer-tone pack scheduled to land
		//        in Phase 2). Unset rows fall back to "rok-commander" via
		//        the `default` here AND via the registry fallback in
		//        `getPluginCopy`, so the field is purely additive on
		//        legacy data.
		// Who:   every embed builder that calls `getPluginCopy(guildConfig)`
		//        reads this field to pick the right pack. Phase 1 ships
		//        the schema, registry, and lookup helpers; the embed
		//        builders themselves migrate to plugin-aware lookups in
		//        the follow-up phase that lands the streamer pack content.
		// When:  set when a guild installs a non-default plugin (Phase 2's
		//        general-events install flow). Existing rows continue to
		//        load as "rok-commander" without any data backfill.
		// Where: read by `getPluginCopy` at every render. Written by the
		//        plugin-install slash command (Phase 2) and never mutated
		//        at runtime — switching plugins after install is an admin
		//        action that requires re-running setup so the home base
		//        category and channels match the new pack's expectations.
		// How:   loose `String` validator (not an enum) so adding a third
		//        plugin pack later is a code-only change without a schema
		//        migration. The `PluginId` TypeScript union in
		//        `@base/copy/types` is the canonical authority on which
		//        ids are valid; Mongoose accepts any string and the
		//        runtime resolver handles unknown ids by falling back.
		pluginId: { type: String, required: false, default: "rok-commander" },

		// ── per-guild copy overrides (streamer-plugin spec Phase 1) ────
		// What:  owner-authored replacements for individual copy strings.
		//        A map from dotted-path keys (e.g. "responses.setupFailed",
		//        "scheduleBoard.title") to the override string the owner
		//        wants the bot to use instead of the pack default.
		// Who:   read by `getCopyOverride` ahead of every pack lookup so
		//        an override wins over the pack default. Written by the
		//        Phase 3 dashboard editor UI ("Voice & Copy" tab under
		//        plugin settings).
		// When:  Phase 1 ships the data plumbing only — the schema field
		//        and the resolver function. Call sites do not honor the
		//        override layer until they migrate to `getCopyOverride`,
		//        which happens incrementally as Phase 2 / Phase 3 deliver
		//        the streamer plugin and the editor UI. New rows get an
		//        empty Map; legacy rows load Map() lazily on first read.
		// Where: stored as a Mongoose Map so adding new overridable keys
		//        requires no schema migration — every key the bot reads
		//        through `getCopyOverride` is overridable for free.
		// How:   `default: () => new Map()` rather than a static literal
		//        so each document gets its own Map instance instead of
		//        sharing a reference. Values are constrained to strings;
		//        function-template copy (e.g. `intervalLabel(hours)`) is
		//        intentionally NOT overridable in v1 because it would
		//        require a templating engine and the audit surface gets
		//        complicated fast. v2 can revisit if real demand shows up.
		copyOverrides: { type: Map, of: String, required: false, default: () => new Map<string, string>() },

		// ── auto-heal toggle (streamer feedback 2026-05-11) ───────────────
		// What:  master switch for the bot's channel auto-repair behavior.
		//        When true (default), the boot sweep's repairMissingChannels
		//        and the realtime ChannelDeleteWatcher rebuild any homebase
		//        channel that goes missing. When false, both paths early-
		//        return after logging a single summary line per boot so the
		//        streamer can see in Railway logs that repairs were skipped
		//        without filling the log with one entry per channel.
		// Who:   admins who deliberately deleted/renamed channels and do not
		//        want the bot reconstituting them. Asked for in 2026-05-11
		//        streamer feedback.
		// When:  read by ChannelDeleteWatcher and by GuildSetupManager.autoSetup
		//        before the repair sweep. Toggled by /configure-auto-heal.
		// Where: nullable so legacy rows load cleanly. Default true preserves
		//        existing behavior — no data migration needed.
		// How:   plain Boolean. Schema bumps for additional repair-related
		//        flags can sibling this field; no need to nest yet.
		autoHealEnabled: { type: Boolean, required: false, default: true },

		// ── custom channel names (streamer feedback 2026-05-11) ───────────
		// What:  per-slot custom name overrides set by /rename-channel.
		//        Keyed by configField name (e.g., "leaderboardChannelId")
		//        with the value being the admin's chosen channel name.
		//        repairOneChannel reads this map before falling back to
		//        spec.displayName so a rebuild after channel deletion
		//        preserves whatever name the admin had chosen.
		// Who:   written by /rename-channel slash command (renames the
		//        live Discord channel AND persists the override here).
		//        Read by GuildSetupManager.repairOneChannel and by any
		//        future rebuild path that builds a channel from a spec.
		// When:  written on every /rename-channel invocation. Read at
		//        rebuild time. Cleared by /rename-channel if the admin
		//        sets the name back to the pack default (which is the
		//        existing spec.displayName).
		// Where: a Mongoose Map so adding a new slot in the future is a
		//        zero-migration write. Direct Discord-side renames do
		//        NOT update this map by design — the announcement copy
		//        explains the rule so admins understand "to persist
		//        across rebuilds, use the slash command."
		// How:   default empty Map. Legacy rows load with no overrides
		//        and repair behavior is identical to pre-flag behavior
		//        (use spec.displayName).
		channelNames: { type: Map, of: String, required: false, default: () => new Map<string, string>() },

		// ── user-removed channels (streamer feedback 2026-05-11) ──────────
		// What:  array of GuildConfig configField names (e.g.
		//        "leaderboardChannelId", "announcementsChannelId") that the
		//        admin has explicitly removed via the dashboard or via a
		//        slash command's follow-up button. repairMissingChannels
		//        consults this array per spec and SKIPS rebuilding any
		//        entry whose configField is listed here, even when
		//        autoHealEnabled is true. This is how a user-initiated
		//        removal supersedes the global auto-heal default — without
		//        this flag the boot sweep treats null storedId as
		//        "legacy row missing the new channel, rebuild it," which
		//        is the wrong semantics for "the admin deleted this on
		//        purpose."
		// Who:   written by the per-channel deletion handlers (today only
		//        leaderboardChannelHandlers.ts; future channel-lifecycle
		//        work will add more). Cleared by the corresponding
		//        toggle-back-on path on the related /configure-* command
		//        so the channel rebuilds on the next sweep.
		// When:  pushed when the admin clicks "Remove <channel>" on the
		//        slash command's follow-up button. Pulled when the admin
		//        re-enables the related feature toggle.
		// Where: stored as a flat string array (configField names) rather
		//        than nesting per-channel objects. Adding a new
		//        removable channel later requires no schema migration —
		//        just push its configField name from the new handler.
		// How:   default empty array so legacy rows load cleanly. The
		//        repair sweep treats absence-from-array as "not removed"
		//        which is the same as the pre-flag behavior.
		userRemovedChannels: { type: [String], required: false, default: () => [] as string[] },

		// ── leaderboard tracking toggle (streamer feedback 2026-05-11) ────
		// What:  master switch for participation tracking. When true (default),
		//        ActivityTracker writes PlayerActivity rows on ✅ reactions and
		//        voice-channel joins. When false, both listener handlers
		//        early-return so no new rows are written. Existing rows stay
		//        in the DB; /leaderboard continues to render historical data
		//        because the toggle is about new tracking, not destruction.
		// Who:   streamers who do not want participation tracked, or who want
		//        to pause tracking during a hiatus without losing prior data.
		// When:  read at the top of every MessageReactionAdd and voiceStateUpdate
		//        handler in ActivityTracker. Toggled by /configure-leaderboard-tracking.
		// Where: same row as autoHealEnabled. Both are global per-guild
		//        switches, not per-event or per-channel.
		// How:   plain Boolean. Hide-history-on-disable was rejected as MVP
		//        scope creep: data deletion (or visibility flip) is a separate
		//        admin action and should be its own command if/when needed.
		leaderboardTrackingEnabled: { type: Boolean, required: false, default: true },

		// ── hidden channels (v1.5.1 item 4, added 2026-05-12) ──────────
		// Tracks which optional bot-managed channels the admin has chosen
		// to hide from members. Hiding applies @everyone deny ViewChannel
		// on the channel; showing removes the deny. The channel itself
		// always exists; the bot still posts to it; only member visibility
		// changes. Solves the streamer feedback "many channels go unused"
		// without the heavier create-or-delete refactor.
		// Values are channel-kind names like "commandsChannelId",
		// "leaderboardChannelId", etc, matching the GuildConfig field
		// names. Empty array means all channels are visible (default).
		// adminChannelId and introChannelId are NEVER added to this list
		// because they are the bot's primary admin surface and marketing
		// surface respectively. /setup hide refuses to accept them.
		hiddenChannels: { type: [String], required: false, default: () => [] as string[] },

		// ── auto-leave grace period (v1.5.1 item 9, added 2026-05-12) ──
		// Timestamp of the first permission failure on category creation.
		// Set when autoSetup catches DiscordAPIError 50013 on the category
		// create call (the entry point that proves the bot does not have
		// enough permissions to operate). Cleared on successful autoSetup.
		// When this value is older than 7 days, the auto-leave flow fires:
		// DM the owner with the Administrator-invite explanation, log the
		// leave to botLogs, then call guild.leave(). Grace period prevents
		// the bot from leaving guilds where an admin is mid-installation
		// and still wiring permissions. Field is nullable so legacy rows
		// load cleanly and rows that have never seen a failure stay
		// unmarked. The 7-day threshold is chosen because real installs
		// resolve within 24 hours and a week is a comfortable buffer for
		// admins on vacation or in slow-response timezones.
		firstPermissionFailureAt: { type: Date, required: false, default: null },
		// ── schedule pause/resume (added 2026-05-12 to fix silent-drop bug) ─
		// Holds the global schedule pause state for the guild. Written by
		// the /api/schedule/pause and /resume HTTP routes; read by
		// ReminderScheduler at every tick to decide whether to fire
		// reminders for events on this guild's schedule. Previously written
		// by the routes without being declared here, which meant Mongoose
		// strict mode silently dropped every write and reads always returned
		// undefined. The pause/resume feature looked functional in the
		// dashboard (route returned 200) but did nothing in production
		// because the data never persisted. The consumer-side
		// `as unknown as { schedulePaused?: ... }` casts in schedule.routes,
		// ReminderScheduler, and health.routes were the TypeScript workaround
		// pattern that hid the schema gap. Default shape is
		// { paused: false, pausedUntil: null } so existing rows load without
		// a migration; the field appears on first write.
		schedulePaused: {
			type: {
				paused: { type: Boolean, required: false, default: false },
				pausedUntil: { type: Date, required: false, default: null },
			},
			required: false,
			default: () => ({ paused: false, pausedUntil: null }),
		},
	},
	{ timestamps: true }
);

const GuildConfigModel = mongoose.model("GuildConfig", guildConfigSchema);
export default GuildConfigModel;
