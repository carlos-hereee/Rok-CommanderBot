import { ColorResolvable } from "discord.js";
import type { IEmbedField, IPluginCopy } from "../types.js";

// ── general-events copy pack (streamer-plugin spec Phase 2 scaffold) ─────
// What:  the plain-English / streamer-tone alternative to rok-commander.
//        Used for any guild whose `GuildConfig.pluginId === "general-events"`.
//        Same shape as rok-commander.pack.ts so callers stay polymorphic;
//        only the words shipped to mortals change.
// Who:   community / streamer servers that want event reminders without the
//        medieval ROK roleplay voice. The first user is the streamer who
//        prompted the streamer-plugin spec; subsequent installs route here
//        via `setAppPlugin` on the dashboard.
// When:  every embed builder and slash command response that already calls
//        `getPluginCopy(guildConfig)` pulls from this pack when the guild
//        opted into "general-events". Per-guild copy overrides via
//        `getCopyOverride` still layer on top — owners who want to nudge a
//        single string can do so without forking the pack.
// Where: lives at `@base/copy/packs/general-events.pack`. Registered in
//        `@base/copy/packs.ts` COPY_PACKS so the runtime resolver finds it.
//        AVAILABLE_PLUGINS in the dashboard's PluginsContainer + PluginShell
//        MANIFEST_REGISTRY + nexious-server PLUGIN_REGISTRY all need to know
//        about "general-events" for the full end-to-end scaffold to work.
// How:   genuinely ROK-only keys (kvkConfirmation, configureReminders,
//        seasonEnd public surface, kvkConfigured response) are stubbed with
//        "[unused in this plugin]" sentinels per spec recommendation. If the
//        bot ever routes a general-events guild through a ROK-only code path
//        the user-visible string surfaces the bug loudly instead of silently
//        rendering empty content. The streamer-tone blocks that already
//        existed inside rok-commander (`streamSchedule`, `pauseSchedule`,
//        `goLiveSoon`, `announceStream`) are reproduced verbatim — they were
//        authored in plain voice from day one and no rewrite is needed.

const STUB = "[unused in this plugin]";

export const generalEventsCopy: IPluginCopy = {
	FOOTER: "Stream Commander",

	// Same palette as rok-commander. Color is neutral by design — the kingdom
	// vs streamer split happens in words, not in chrome. Keeping the same
	// keys means embed builders that read `c.COLORS.REMINDER` work without a
	// branch on plugin id.
	COLORS: {
		REMINDER: "Red",
		SEASON_END: "DarkGrey",
		LEADERBOARD: "Gold",
		CONFIRMATION: "Yellow",
		ERROR: "DarkRed",
		ARRIVAL: "DarkGold",
		INTRODUCTION: "DarkGold",
		COMMANDS: "DarkBlue",
		SCHEDULE: "DarkGreen",
		ANNOUNCEMENTS: "DarkRed",
		ADMIN: "DarkPurple",
		NEXT_DECREE: "DarkNavy",
	} satisfies Record<string, ColorResolvable>,

	listEvents: {
		title: "📅 Active Events",
		noEvents:
			"📭 No active events are configured for this server yet.\n\n" +
			"Run `/configure-stream-schedule` for weekly streams or `/announce-stream` for one-off events.",
		fieldName: (name: string, type: "recurring" | "one-time") => (type === "recurring" ? `🔁 ${name}` : `📌 ${name}`),
		nextOccurrenceLabel: "Next occurrence",
		scheduledDateLabel: "Scheduled date",
		intervalLabel: (hours: number) => `Repeats every **${hours} hours**`,
		seasonEndLabel: "Ends",
		postedToHeader: (channelId: string) => `📢 All reminders post to <#${channelId}>`,
		postedToHeaderUnset: "⚠️ No announcements channel configured. Run `/setup` to build the home base.",
	},

	deleteEvent: {
		confirmTitle: "🗑️ Confirm Deletion",
		confirmDescription: (name: string) =>
			`Are you sure you want to delete **${name}**?\n\n` +
			"This will stop all future reminders for this event.\n" +
			"*This action cannot be undone.*",
		successDescription: (name: string) => `✅ **${name}** has been deleted. No further reminders will fire.`,
		notFound: (input: string) => `❌ No active event found matching **${input}**.`,
		cancelled: "❌ Deletion cancelled.",
		timedOut: "⏱️ No response — deletion cancelled.",
	},

	reminder: {
		title: (name: string, minutes: number) => `📺 ${name} starts in ${minutes} minutes!`,
		description: "Heads up — getting close to start time.",
		checklistField: "📋 Pre-stream Checklist",
		timeField: "🕐 Start Time",
	},

	testReminder: {
		// [TEST] prefix is a non-negotiable safety signal — same as rok-commander.
		// The dashboard test fire feature is the same on both packs; only the
		// audience copy underneath changes.
		title: (name: string) => `[TEST] 📺 ${name} — reminder drill`,
		description:
			"This is a test reminder dispatched from the admin dashboard. " +
			"No action required. " +
			"The real reminder will arrive at the scheduled time.",
		checklistField: "📋 Pre-stream Checklist (preview)",
		timeField: "🕐 Next Real Occurrence",
	},

	// Stubbed: KvK season is a Rise of Kingdoms concept. A general-events
	// guild that hits this code path is hitting a bug. The sentinel makes
	// that bug visible instead of letting the embed render empty.
	seasonEnd: {
		title: STUB,
		description: STUB,
	},

	leaderboard: {
		title: (name: string) => `🏆 ${name} — Leaderboard`,
		footer: "Full leaderboard available on the admin dashboard",
		row: (medal: string, username: string, score: number, events: number, acknowledged: number) =>
			`${medal} **${username}**\n` + `Score: ${score} | ` + `Events: ${events} | ` + `Reminders acknowledged: ${acknowledged}`,
		medals: ["🥇", "🥈", "🥉"],
	},

	// Public schedule board pinned in the schedule channel. Voice stays
	// streamer-friendly; the rok-commander pack used "Decree Calendar"
	// here, this pack uses plain language.
	scheduleBoard: {
		title: "📅 Event Schedule",
		description: (announcementsChannelId: string | null) =>
			announcementsChannelId
				? `📺 Reminders post in <#${announcementsChannelId}>. Keep an eye on this channel.`
				: "⚠️ No announcements channel configured yet. An admin needs to finish `/setup` before reminders can fire.",
		noEvents:
			"📭 No events configured.\n\n" +
			"An admin can run `/configure-stream-schedule` to set up a recurring stream or `/announce-stream` for a one-off.",
		// `seasonEnded` is reused for general-events as "season ended" wording but
		// kept as a stub since general-events guilds do not use the season concept.
		// Code paths that try to render this string are bugs; sentinel surfaces them.
		seasonEnded: STUB,
		fieldName: (name: string, type: "recurring" | "one-time") => (type === "recurring" ? `🔁 ${name}` : `📌 ${name}`),
		nextOccurrenceLabel: "Next",
		scheduledDateLabel: "Scheduled",
		intervalLabel: (hours: number) => `Repeats every **${hours} hours**`,
		// Kept as STUB — there is no season anchor on general-events guilds.
		seasonEndTopLabel: STUB,
		completedSectionTitle: "📜 Completed Events",
		completedDateLabel: "Concluded",
		footer: "Updated automatically.",
	},

	// Stubbed: /configure-kvk-season is a ROK-only command. General-events
	// guilds use /configure-stream-schedule instead, which has its own copy
	// block (streamSchedule below). Sentinels here surface the bug if any
	// code path leaks ROK config flow into a general-events guild.
	configureReminders: {
		setupRequired: STUB,
		ruinsInvalid: STUB,
		altarInvalid: STUB,
		kauInvalid: STUB,
		invalidInputsHeader: STUB,
		ruinsAfterSeason: STUB,
		altarAfterSeason: STUB,
		kauAfterSeason: STUB,
		dateConflictsHeader: STUB,
		cancelled: STUB,
		settingUp: STUB,
		timedOut: STUB,
		confirmButtonLabel: STUB,
		editButtonLabel: STUB,
		bulletList: (items: string[]) => items.map((item) => `- ${item}`).join("\n"),
		checklistPromptTitle: STUB,
		checklistPromptDescription: STUB,
		checklistAcceptButtonLabel: STUB,
		checklistCustomizeButtonLabel: STUB,
		checklistSkipButtonLabel: STUB,
		checklistModalTitle: STUB,
		checklistModalInputLabel: STUB,
		checklistModalInputPlaceholder: STUB,
		checklistResolvedAccept: STUB,
		checklistResolvedCustom: (_itemCount: number) => STUB,
		checklistResolvedSkipped: STUB,
		checklistEmptyError: STUB,
		checklistPromptTimedOut: STUB,
	},

	// Stubbed: same reasoning as configureReminders. KvK is ROK-only.
	kvkConfirmation: {
		title: STUB,
		description: STUB,
		fields: {
			seasonEnd: STUB,
			ruins: {
				name: STUB,
				interval: STUB,
			},
			altar: {
				name: STUB,
				interval: STUB,
			},
			kau: {
				name: STUB,
			},
			channel: STUB,
		},
	},

	error: {
		title: "❌ Error",
	},

	arrival: {
		title: "📺 The bot is here.",
		description: (guildName: string, ownerId: string) =>
			`Hey <@${ownerId}>,\n\n` +
			`I have joined **${guildName}**.\n\n` +
			"Before I can do anything useful, I need one thing from you:\n\n" +
			"**Run `/setup` and pick an admin role.**\n\n" +
			"Once that is done I will build the home channels and start posting reminders for any events you configure.",
	},

	setup: {
		// Neutral category name. The rok-commander pack uses "🔱 BY DIVINE DECREE";
		// this pack uses plain language so it reads as a normal Discord category.
		categoryName: "📺 Stream Hub",
		devSuffix: " (dev)",
		channels: {
			// Same channel keys as rok-commander so GuildSetupManager.populateChannels
			// does not need to branch on plugin id. Display names are neutral.
			intro: "📜introductions",
			commands: "📖command-center",
			leaderboard: "🏆leaderboard",
			schedule: "📅event-schedule",
			announcements: "📢announcements",
			admin: "🔒admin",
			nextDecree: "🛡️up-next",
		},
	},

	channelContent: {
		introduction: {
			title: "📺 Welcome.",
			description:
				"Hey everyone — I am the **Stream Commander** for this server.\n\n" +
				"I keep an eye on the schedule so you do not have to. I post reminders before every stream or event, " +
				"keep a pinned schedule visible, and track who showed up.\n\n" +
				"**── What I do ──**\n" +
				"📺 Reminders before every scheduled stream or event.\n" +
				"📅 A pinned schedule that stays current automatically.\n" +
				"🏆 An optional leaderboard for active members.\n" +
				"⚙️ Configurable from Discord slash commands or the dashboard.\n\n" +
				"*Stick around — the next event is on its way.*\n\n" +
				"**Want me on your server?** The button below will summon me.",
		},

		commandGuide: {
			title: "📖 Member Commands",
			description:
				"The slash commands every member can run today. The full command set lives in the admin channel.",
			fields: [
				{
					name: "🏆 Leaderboard",
					value: ["`/leaderboard`", "View participation rankings."].join("\n"),
				},
				{
					name: "📋 Events",
					value: ["`/list-events`", "View all configured events."].join("\n"),
				},
			] satisfies IEmbedField[],
		},

		adminCommandGuide: {
			title: "🔒 Admin Command Guide",
			description:
				"The slash commands available to admins on this server.\n\n" +
				"Members never see this guide — the admin channel is role-gated.",
			fields: [
				{
					name: "📺 Stream / Schedule Commands",
					value: [
						"`/configure-stream-schedule`",
						"Set up a weekly recurring reminder on a fixed day and time.",
						"`/announce-stream`",
						"Schedule a one-off reminder for a specific future date and time.",
						"`/go-live-soon`",
						"Post a quick going-live announcement. One-shot, no reminder.",
						"`/pause-schedule`",
						"Pause reminders for a recurring event without deleting it.",
						"`/continue-schedule`",
						"Resume a paused recurring event.",
					].join("\n"),
				},
				{
					name: "📋 Event Management",
					value: ["`/delete-event`", "Remove a configured event."].join("\n"),
				},
			] satisfies IEmbedField[],
		},

		schedule: {
			title: "📅 Event Schedule",
			description:
				"Upcoming events appear here once configured.\n\n" +
				"An admin can run `/configure-stream-schedule` to add a recurring stream " +
				"or `/announce-stream` to schedule a one-off.",
		},

		leaderboard: {
			title: "🏆 Active Members",
			description:
				"Member participation rankings post here after each event.\n\n" +
				"Reactions and attendance count toward the score.",
		},

		announcements: {
			title: "📢 Announcements",
			description:
				"Event reminders and stream announcements post here.\n\n" +
				"*Subscribe to this channel to never miss a stream.*",
		},

		nextDecree: {
			title: "🛡️ Up Next",
			description:
				"A heads-up for the next event on the schedule.\n\n" +
				"As each event nears within the next day, a fresh post appears here with the time and any prep notes.\n\n" +
				"*Posts stay around so you can scroll back to confirm what was announced.*",
		},

		adminWelcome: {
			title: "🔒 Admin Channel",
			description: (ownerId: string, adminRoleId: string) =>
				`Hey <@${ownerId}>, you finished setup.\n\n` +
				`Members with <@&${adminRoleId}> can also use this channel to operate the bot.\n\n` +
				"From here you can configure events, manage reminders, and check the dashboard.\n\n" +
				"*Members of the server cannot see this channel.*",
		},

		channelRepairNotice: {
			title: "🔧 A Channel Was Restored",
			description: (channelName: string) =>
				`I noticed **${channelName}** was deleted from the server. ` +
				"I have rebuilt it.\n\n" +
				"⚠️ Every channel inside **📺 Stream Hub** is required for the bot to work. " +
				"If any are removed I cannot function properly. " +
				"Please leave them in place.",
			// Summary copy for multi-channel restores in a single sweep.
			summaryTitle: "🔧 Channels Were Restored",
			summaryBody: (count: number) =>
				`${count} channel${count === 1 ? "" : "s"} ${count === 1 ? "was" : "were"} deleted from the server. ` +
				"I have rebuilt them.\n\n" +
				"⚠️ Every channel inside **📺 Stream Hub** is required for the bot to work. " +
				"If any are removed I cannot function properly. " +
				"Please leave them in place.\n\n" +
				"Restored channels:",
		},
		castleRebuiltNotice: {
			title: "📺 Stream Hub Was Rebuilt",
			description:
				"My home category was missing when I came online. " +
				"I have rebuilt **📺 Stream Hub** and every channel inside it.\n\n" +
				"⚠️ The category and its channels are required for me to work. " +
				"Please do not delete them.",
		},
	},

	responses: {
		adminRolePending:
			"⚠️ **No admin role has been designated yet.**\n\n" + "Run `/setup` to assign a role that can configure this bot.",
		noWizardPowers:
			"⚠️ **You do not have permission to run this command.**\n\n" +
			"This command is reserved for server admins.",
		ownerOnly:
			"⚠️ **Only the server owner can run this command.**\n\n" +
			"Setup must be completed by the server owner before other admins can configure the bot.",
		alreadySetup:
			"📺 **Stream Hub is already set up.**\n\n" +
			"The bot's home category and channels already exist.\n" +
			"You do not need to run setup twice.",
		setupSuccess: (adminRoleId: string) => ({
			title: "📺 Stream Hub Set Up",
			description:
				"📺 **Stream Hub has been built.**\n\n" +
				`<@&${adminRoleId}> now has access to the admin channel.\n\n` +
				"You can configure your first event with `/configure-stream-schedule` or `/announce-stream`.",
		}),
		// Stubbed — kvkConfigured is the success response for /configure-kvk-season,
		// a ROK-only command. General-events guilds never reach this code path; if
		// they do the sentinel surfaces the routing bug.
		kvkConfigured: (_seasonEnd: number, _channelId: string) => STUB,
		setupFailed: "Something went wrong during setup. Please try again.",
		kvkConfigureFailed: STUB,
		commandExecuteFailure: "Something went wrong executing this command.",
		setupChannelsPending: "Channels are still being created. Please wait a moment and try again.",
		setupPending: {
			title: "📺 Setting Up",
			description: "Building **Stream Hub**... please stand by.",
		},
		setupRequired:
			"⚠️ **Setup has not been completed.**\n\n" + "An admin must run `/setup` before any commands can be used.",
	},

	// Streamer-tone copy that already lived in rok-commander.pack.ts. Reproduced
	// here verbatim because it was already authored in plain voice — no rewrite
	// needed. Eventually this and the rok-commander copy could share a base
	// fragment, but Phase 2 prioritizes correctness over deduplication.
	streamSchedule: {
		setupRequired: "Run `/setup` first so the bot has an announcements channel to post in.",
		invalidTime: "Time invalid. Use 24h `HH:MM` like `19:30` or `09:00`.",
		invalidDay: "Day invalid. Pick one of: monday, tuesday, wednesday, thursday, friday, saturday, sunday.",
		alreadyExists: (name: string) =>
			`A schedule named **${name}** already exists. Pause it with \`/pause-schedule\` or pick a different name.`,
		confirm: {
			title: "📺 Confirm stream schedule",
			description: (name: string, dayLabel: string, nextOccurrenceUnix: number) =>
				[
					`**${name}** — every **${dayLabel}**.`,
					`Next stream: <t:${nextOccurrenceUnix}:F> (<t:${nextOccurrenceUnix}:R>)`,
					"",
					"Reminders fire at the offsets configured for this guild (default: 30 and 15 minutes before).",
				].join("\n"),
			audienceLine: (mentionRoleId: string | null, channelId: string) =>
				mentionRoleId ? `Pinging <@&${mentionRoleId}> in <#${channelId}>.` : `Pinging the guild member role in <#${channelId}>.`,
			autoPauseLine: (untilUnix: number) => `Auto-pauses on <t:${untilUnix}:F> (<t:${untilUnix}:R>) unless extended.`,
			confirmButtonLabel: "✅ Save schedule",
			cancelButtonLabel: "✖️ Cancel",
		},
		cancelled: "Cancelled. Nothing was saved.",
		timedOut: "Timed out. Run the command again when ready.",
		saved: (name: string) => `✅ **${name}** is live. The bot will post reminders before every stream.`,
		saveFailed: "Could not save the schedule. Try again — if it keeps failing, ping the bot owner.",
	},

	pauseSchedule: {
		notFound: "No schedule by that name. Use `/list-events` to see what is configured.",
		alreadyPaused: (name: string) => `**${name}** is already paused.`,
		paused: (name: string) => `⏸️ **${name}** paused. Resume with \`/continue-schedule name:${name}\`.`,
		pausedUntil: (name: string, untilUnix: number) =>
			`⏸️ **${name}** paused until <t:${untilUnix}:F> (<t:${untilUnix}:R>). It will resume automatically.`,
		invalidDuration: "Duration invalid. Use a positive number of days, max 90.",
		alreadyActive: (name: string) => `**${name}** is already active.`,
		resumed: (name: string) => `▶️ **${name}** resumed. Reminders will fire on the next scheduled time.`,
		failed: "Could not update the schedule. Try again.",
	},

	pauseAllSchedules: {
		noEvents: "No schedules to pause — this server has no events configured.",
		allAlreadyPaused: (total: number) =>
			`All ${total} schedules are already paused. Use \`/continue-all-schedules\` to resume them.`,
		paused: (count: number, skipped: number) =>
			skipped > 0
				? `⏸️ Paused **${count}** schedule(s). Skipped ${skipped} already-paused schedule(s) so their existing auto-resume dates stay intact.`
				: `⏸️ Paused **${count}** schedule(s). Resume any with \`/continue-schedule\` or all with \`/continue-all-schedules\`.`,
		pausedUntil: (count: number, skipped: number, untilUnix: number) =>
			skipped > 0
				? `⏸️ Paused **${count}** schedule(s) until <t:${untilUnix}:F> (<t:${untilUnix}:R>). Skipped ${skipped} already-paused schedule(s) so their existing auto-resume dates stay intact.`
				: `⏸️ Paused **${count}** schedule(s) until <t:${untilUnix}:F> (<t:${untilUnix}:R>). They will resume automatically.`,
		invalidDuration: "Duration invalid. Use a positive number of days, max 90.",
		partialFailure: (succeeded: number, failed: number) =>
			`Updated ${succeeded} schedule(s) but ${failed} failed. Run \`/list-events\` to see which ones flipped, then retry the rest individually.`,
		failed: "Could not pause the schedules. Try again.",
	},

	continueAllSchedules: {
		noEvents: "No schedules to resume — this server has no events configured.",
		noneCurrentlyPaused: "No schedules are currently paused. Nothing to resume.",
		resumed: (count: number) =>
			`▶️ Resumed **${count}** schedule(s). Reminders will fire on each event's next scheduled time.`,
		partialFailure: (succeeded: number, failed: number) =>
			`Resumed ${succeeded} schedule(s) but ${failed} failed. Run \`/list-events\` to see what is still paused, then retry the rest individually.`,
		failed: "Could not resume the schedules. Try again.",
	},

	goLiveSoon: {
		setupRequired: "Run `/setup` first so the bot has an announcements channel to post in.",
		invalidLeadTime: "Pick a lead time from the list (now / 10m / 30m / 1h / 3h / 6h).",
		announcementTitle: "📺 Going live soon",
		announcementBody: (leadLabel: string, startUnix: number, note: string | null) =>
			[`Stream starts **${leadLabel}** — <t:${startUnix}:t> (<t:${startUnix}:R>).`, note ? `\n${note}` : ""]
				.filter(Boolean)
				.join("\n"),
		posted: "✅ Announcement posted.",
		postFailed: "Could not post the announcement. Check bot permissions on the announcements channel.",
	},

	// featureAnnouncement: rok-commander's public copy is kingdom-voice. The
	// general-events equivalent uses plain English. innerSanctum is already
	// plain admin changelog in rok-commander; this pack mirrors its tone.
	// When the next bot release ships, BOTH packs need their copy updated in
	// lockstep — the admin sub-pack is the same content, only the public sub-pack
	// gets translated per voice.
	featureAnnouncement: {
		// ── v1.5.1 ── Paused schedules stay quiet end to end ──────────
		// Bug-fix-framed release. Same content as rok-commander pack;
		// only the public voicing changes (neutral "stream schedules"
		// vs kingdom "decrees"). innerSanctum is structurally identical
		// to rok-commander's, swapping decree/next-decree for stream/
		// next-up.
		public: {
			title: "📺 v1.5.1: Paused schedules now stay fully silent",
			description:
				"Previously, pausing a stream schedule stopped its reminders as intended, but the next-up channel could still post \"upcoming stream\" announcements ahead of time. This created confusion for viewers because a stream would appear scheduled even though the streamer had already silenced it.\n\n" +
				"This update fixes that behavior. The next-up channel now respects paused schedules and skips all announcements tied to them, keeping communication consistent from the moment a streamer runs `/pause-schedule`.\n\n" +
				"Thank you for taking the time to share your feedback. Every message helps improve the experience and shape future updates. We genuinely appreciate the support, ideas, and bug reports; if you have more ideas, suggestions, or even small nitpicks, send them my way.",
		},
		innerSanctum: {
			title: "🎬 v1.5.1: Streamer patch",
			description:
				"**Bug fixes:**\n" +
				"• `/list-events` was showing paused schedules with no indicator, and the \"next occurrence\" timestamp on those rows read as if they were still about to fire. Admins reviewing the list could not tell which schedules were live and which were silenced. Paused rows now tag the field name with \"⏸️ paused\", hide the next-occurrence and interval lines, and show an auto-resume timestamp when one is set.\n" +
				"• Upcoming-stream posts in the next-up channel were still firing for paused schedules even though their reminders were silenced, so viewers saw \"stream at X\" posts for events the streamer had paused. The next-up channel now respects paused state and skips posts for any paused schedule.\n" +
				"• On bot restart, the next-up channel was re-posting every upcoming-stream announcement inside the 24-hour horizon because the dedup cache lived in process memory only and wiped on each boot. The cache now seeds itself from the channel's last 100 messages on first refresh per guild per process, so restarts no longer cause duplicate posts.\n" +
				"• `/rename-channel` autocomplete was showing the static slot labels (\"Leaderboard\", \"Schedule board\") instead of the live channel names admins had renamed them to, so the dropdown was stale the second time anyone ran the command. The dropdown now reads from current Discord state and shows the channel's actual name, with the slot label in parens for context.\n" +
				"• `/pause-schedule` autocomplete was listing already-paused events alongside live ones, making the dropdown ambiguous about which schedules could still be paused. The autocomplete now filters paused events out so only live schedules appear.\n\n" +
				"**New commands:**\n" +
				"• `/pause-all-schedules` and `/continue-all-schedules`. Bulk versions of the single-event pause and continue commands. Pause-all skips already-paused schedules so any auto-resume dates set individually stay intact.\n" +
				"• `/channels hide|show|list`. Toggle channels on and off for members via permission overwrite. Channels stay alive in the background; bot keeps posting; only member visibility changes.\n\n" +
				"**Operational:**\n" +
				"• If the bot ever cannot build or rebuild its homebase due to missing permissions, the server owner gets a DM with a 7-day grace deadline. The bot leaves on day 7 unless the permissions are restored.\n\n" +
				"Thank you for taking the time to share your feedback. Every message helps improve the experience and shape future updates. We genuinely appreciate the support, ideas, and bug reports; if you have more ideas, suggestions, or even small nitpicks, send them my way.\n\n" +
				"Ping silent6804 on Discord.",
		},
	},

	announceStream: {
		setupRequired: "Run `/setup` first so the bot has an announcements channel to post in.",
		invalidDateTime: "Date/time invalid. Use `MM/DD @HH:MM` like `04/26 @19:30`.",
		dateInPast: "That time is already in the past. Pick a future date and time.",
		confirm: {
			title: "📺 Confirm planned stream",
			description: (title: string, startUnix: number) =>
				[
					`**${title}**`,
					`Starts: <t:${startUnix}:F> (<t:${startUnix}:R>)`,
					"",
					"Reminders fire at the offsets configured for this guild (default: 30 and 15 minutes before).",
				].join("\n"),
			audienceLine: (mentionRoleId: string | null, channelId: string) =>
				mentionRoleId ? `Pinging <@&${mentionRoleId}> in <#${channelId}>.` : `Pinging the guild member role in <#${channelId}>.`,
			confirmButtonLabel: "✅ Schedule it",
			cancelButtonLabel: "✖️ Cancel",
		},
		cancelled: "Cancelled. Nothing was saved.",
		timedOut: "Timed out. Run the command again when ready.",
		saved: (title: string) => `✅ **${title}** scheduled. The bot will post reminders before it starts.`,
		saveFailed: "Could not schedule the stream. Try again.",
	},
};
