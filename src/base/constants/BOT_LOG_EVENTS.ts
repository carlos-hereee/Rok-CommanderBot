export const BOT_LOG_EVENTS = {
	INTRO_DM_SENT: "intro_dm_sent",
	SEASON_END_ANNOUNCED: "season_end_announced",
	// ── feature announcement idempotency ──────────────────────────
	// What:  per-guild log that a specific version's feature announcement
	//        has already been posted. The log `event` string is composed
	//        at call time as `feature_announced:<version>` so each release
	//        gets its own bucket. Querying botLogStore.has(guildId,
	//        "feature_announced:1.2.4") tells us whether this guild has
	//        already seen the 1.2.4 announcement.
	// Who:   postFeatureAnnouncement reads + writes. No other caller.
	// When:  read once per boot per guild; written once per successful
	//        public + inner-sanctum post pair.
	// Where: lives in the same BotLog collection as INTRO_DM_SENT so
	//        the idempotency model is consistent across features.
	// How:   prefix constant here + template helper below keeps call
	//        sites symmetric and grep-able. Concatenating the version in
	//        the event string avoids adding a new schema field for
	//        lastAnnouncedVersion.
	FEATURE_ANNOUNCED_PREFIX: "feature_announced",
	// ── auto-leave (v1.5.1 item 9, 2026-05-12) ─────────────────────
	// Logged once per guild when the bot decides to leave a guild it
	// cannot serve because category creation kept failing with
	// DiscordAPIError 50013 (Missing Permissions) past the 7-day grace
	// period. Metadata captures the failure-state duration and whether
	// the owner DM landed. Read for audit when an operator wonders
	// why the bot is no longer in a guild they previously invited.
	AUTO_LEFT_GUILD: "auto_left_guild",
	// add more here as needed
} as const;

// Compose the per-version feature-announced event key. Kept next to the
// prefix constant so a future change (eg. adding environment tagging)
// lands in one place.
export const featureAnnouncedEvent = (version: string): string =>
	`${BOT_LOG_EVENTS.FEATURE_ANNOUNCED_PREFIX}:${version}`;
