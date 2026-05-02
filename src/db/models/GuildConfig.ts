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
		// channel IDs — stored so bot always knows where to post
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
	},
	{ timestamps: true }
);

const GuildConfigModel = mongoose.model("GuildConfig", guildConfigSchema);
export default GuildConfigModel;
