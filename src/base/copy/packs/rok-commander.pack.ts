import { ColorResolvable } from "discord.js";
import type { IEmbedField } from "../types.js";

// ── ROK Commander copy pack ───────────────────────────────────────────────
// What:  the canonical "kingdom voice" copy for the original ROK Commander
//        plugin. Every static and templated string the bot renders for a
//        guild whose `GuildConfig.pluginId === "rok-commander"` (or null,
//        which the lookup treats as the back-compat default) is sourced
//        from this object.
// Who:   the legacy `embedContent` export at `@base/constants/embed-content`
//        is a thin re-export of this file so the 96 existing import sites
//        keep working without a touch. New code SHOULD prefer
//        `getPluginCopy(guildConfig)` from `@base/copy/getCopy` because it
//        honors `pluginId` and routes the right pack at runtime.
// When:  every embed, slash command response, and channel intro that has
//        ROK-flavored copy reads from this object. Per-guild owner overrides
//        (Phase 3 of the streamer plugin spec) layer on top via
//        `getCopyOverride(key, guildConfig)` before falling back here.
// Where: this file is the SHAPE of `IPluginCopy`. Sibling packs (general-events
//        for the streamer plugin, neutral pack later, etc.) must satisfy the
//        same shape so callers stay polymorphic.
// How:   moved verbatim from the previous `embed-content.ts` location with
//        zero copy edits. The file split is the architectural change; the
//        words shipped to mortals are unchanged so this can land without
//        any visual diff in Discord.
export const rokCommanderCopy = {
	FOOTER: "ROK Commander",

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
		// NextUpBoard posts + 🛡️next-decree channel intro. Navy Blue
		// reads as "shield" without colliding with SCHEDULE (DarkGreen)
		// or ANNOUNCEMENTS (DarkRed) in the sidebar.
		NEXT_DECREE: "DarkNavy",
	} satisfies Record<string, ColorResolvable>,

	listEvents: {
		title: "📅 Active KvK Events",
		noEvents:
			"📭 No active events are configured for this server yet.\n\n" +
			"Streamers: run `/configure-stream-schedule` for weekly streams or `/announce-stream` for one-offs.\n" +
			"ROK alliances: run `/configure-kvk-season` to set up the season schedule.",
		fieldName: (name: string, type: "recurring" | "one-time") => (type === "recurring" ? `🔁 ${name}` : `📌 ${name}`),
		nextOccurrenceLabel: "Next occurrence",
		scheduledDateLabel: "Scheduled date",
		intervalLabel: (hours: number) => `Repeats every **${hours} hours**`,
		seasonEndLabel: "Season ends",
		// single destination line shown once at the top of the list. reminders
		// always post to the guild's announcements channel, so repeating it
		// per event was dead weight.
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
		title: (name: string, minutes: number) => `⚔️ ${name} starts in ${minutes} minutes!`,
		description: "Prepare now so you're ready when the event begins.",
		checklistField: "📋 Preparation Checklist",
		timeField: "🕐 Event Time",
	},

	testReminder: {
		// [TEST] prefix is not optional. it is the user-facing safety signal
		// that this fire is a drill dispatched from the dashboard and not a real alert.
		title: (name: string) => `[TEST] ⚔️ ${name} — reminder drill`,
		description:
			"This is a drill dispatched from the admin dashboard. " +
			"No warrior is expected to act on it. " +
			"The real decree will arrive at the scheduled time.",
		checklistField: "📋 Preparation Checklist (preview)",
		timeField: "🕐 Next Real Occurrence",
	},

	seasonEnd: {
		// ── season-end announcement (announcements channel) ──────
		// What:  the single message posted in #announcements when a
		//        guild's season expires. Voice leans kingdom-flavored
		//        and motivational, not transactional. The previous copy
		//        was "season concluded, run /configure-kvk-season" which
		//        read like a system status line and ignored the fact
		//        that members had spent weeks showing up for the bot.
		// Who:   every member of the guild reads this. Tone has to honor
		//        the work they put in, not just declare a state change.
		//        The admin-only mechanic ("run /configure-kvk-season")
		//        is still present because the bot owner and the alliance
		//        leadership reading this message often overlap, but it
		//        is demoted to the closing line.
		// When:  exactly once per guild per season, gated by the
		//        guild-scoped dedup in announceSeasonEnd. Never edit
		//        this by tweaking past messages — refreshIntroEmbeds is
		//        the only safe place to anchor-edit; one-shot
		//        announcements like this one stand as posted.
		title: "🏁 KvK Season Concluded — Stand Down, Heroes",
		description:
			"The campaign closes. To every warrior who answered the bell, every commander who held the line, every governor who marched out when it counted — thank you. Your discipline shaped this season.\n\n" +
			"Whether the kingdom feasts or rebuilds, the next decree always rises. When the call comes, an admin can summon the next schedule with `/configure-kvk-season`.\n\n" +
			"Sharpen your blades. The realm remembers what you did here.",
	},

	leaderboard: {
		title: (name: string) => `🏆 ${name} — Leaderboard`,
		footer: "Full leaderboard available on the admin dashboard",
		row: (medal: string, username: string, score: number, events: number, acknowledged: number) =>
			`${medal} **${username}**\n` + `Score: ${score} | ` + `Events: ${events} | ` + `Reminders acknowledged: ${acknowledged}`,
		medals: ["🥇", "🥈", "🥉"],
	},

	// ── schedule board (public, lives in the event-schedule channel) ──
	// this is the content of the pinned message ScheduleBoard keeps fresh.
	// it is different copy from listEvents (which is an ephemeral admin reply)
	// because this one is read by every warrior in the alliance, so the voice
	// leans kingdom flavored and skips the admin only language.
	scheduleBoard: {
		title: "📅 Decree Calendar",
		description: (announcementsChannelId: string | null) =>
			announcementsChannelId
				? `⚔️ Reminders will ring out in <#${announcementsChannelId}>. Mortals, stand ready.`
				: "⚠️ The heralds have no channel to shout from. An admin must finish `/setup` before reminders can fire.",
		noEvents:
			"📭 No decrees stand. The kingdom rests.\n\n" + "An admin must run `/configure-kvk-season` to summon the season's events.",
		seasonEnded:
			"🏁 The KvK season has ended. The kingdom stands down.\n\n" + "Run `/configure-kvk-season` when the next campaign begins.",
		fieldName: (name: string, type: "recurring" | "one-time") => (type === "recurring" ? `🔁 ${name}` : `📌 ${name}`),
		nextOccurrenceLabel: "Next",
		scheduledDateLabel: "Scheduled",
		intervalLabel: (hours: number) => `Repeats every **${hours} hours**`,
		// Single source of truth for the bolded season-end banner that now
		// renders once at the top of the embed description. Replaced the
		// old per-row seasonEndLabel after the embed redesign moved the
		// season anchor out of every event row.
		seasonEndTopLabel: "Season ends",
		// Field-name heading that introduces the "Events Completed This Season"
		// block at the bottom of the embed. Field names render naturally bold
		// in Discord, so no markdown is required around the title.
		completedSectionTitle: "📜 Events Completed This Season",
		// Label rendered alongside the date a one-time event was concluded
		// (its firstOccurrence timestamp). Lives in completed-block rows.
		completedDateLabel: "Concluded",
		footer: "Updated automatically. The scroll refreshes itself.",
	},
	// user-facing strings for the /configure-kvk-season command. lives
	// here so every line the warrior sees in Discord can be audited and
	// adjusted from one place alongside the rest of the kingdom voice.
	configureReminders: {
		setupRequired: "This guild has not finished setup. Run /setup before configuring reminders.",
		ruinsInvalid: "Ruins date invalid — use format MM/DD @HH e.g. `04/20 @12`",
		altarInvalid: "Altar date invalid — use format MM/DD @HH e.g. `04/20 @12`",
		kauInvalid: "Kau Karuak date invalid — use format MM/DD e.g. `04/20`",
		invalidInputsHeader: "❌ Invalid inputs:",
		ruinsAfterSeason: "Ruins date must be before the season end date",
		altarAfterSeason: "Altar date must be before the season end date",
		kauAfterSeason: "Kau Karuak Easy date must be before the season end date",
		dateConflictsHeader: "❌ Date conflicts:",
		cancelled: "❌ Configuration cancelled — run `/configure-kvk-season` again with the correct dates.",
		settingUp: "⏳ Setting up reminders...",
		timedOut: "⏱️ Configuration timed out — please run the command again.",
		confirmButtonLabel: "✅ Confirm — Dates are correct",
		editButtonLabel: "✏️ Edit — Dates need changing",
		// formats an array of error lines into the bulleted block that sits
		// under invalidInputsHeader or dateConflictsHeader.
		bulletList: (items: string[]) => items.map((item) => `- ${item}`).join("\n"),

		// ── checklist prompt (Accept defaults / Customize) ─────────
		// Shown as a second ephemeral step after the admin confirms the
		// season dates. Accept keeps the per event type defaults from
		// rok-events.json. Customize opens a modal where the admin types
		// a universal checklist applied to every event this call creates.
		// Skip dismisses the prompt without changing prepSteps (same as
		// Accept in effect; separate button so the intent is explicit and
		// the log line reads clearly).
		checklistPromptTitle: "📋 Preparation Checklist",
		checklistPromptDescription:
			"Each event fires a reminder with a preparation checklist. " +
			"Accept the kingdom's defaults, or customize one list that applies to every event in this season.\n\n" +
			"**Default checklist:**\n" +
			"1. Activate stats token\n" +
			"2. Fetch rune buff\n" +
			"3. Use army expansion\n\n" +
			"You can always edit per event later from the dashboard.",
		checklistAcceptButtonLabel: "✅ Accept defaults",
		checklistCustomizeButtonLabel: "✏️ Customize",
		checklistSkipButtonLabel: "⏭️ Skip for now",
		// Modal copy. Discord modal title cap is 45 chars, label 45, placeholder 100.
		checklistModalTitle: "Customize preparation checklist",
		checklistModalInputLabel: "Checklist items (one per line)",
		checklistModalInputPlaceholder: "1. Activate stats token\n2. Fetch rune buff\n3. Use army expansion",
		// Rendered under the confirmation embed after the admin lands on a
		// final choice. Helps the audit trail: the admin can scroll back and
		// see which checklist they picked for this season.
		checklistResolvedAccept: "✅ Defaults applied to every event in this season.",
		checklistResolvedCustom: (itemCount: number) =>
			`✅ Custom checklist applied (${itemCount} item${itemCount === 1 ? "" : "s"}) to every event in this season.`,
		checklistResolvedSkipped: "⏭️ Skipped — defaults applied. Edit per event from the dashboard any time.",
		checklistEmptyError: "❌ Checklist cannot be empty. Customize requires at least one item, or use Accept defaults instead.",
		checklistPromptTimedOut: "⏱️ Checklist prompt timed out — defaults were applied to every event.",
	},
	kvkConfirmation: {
		title: "⚔️ KvK Reminder Configuration — Please Confirm",
		description: "Verify these dates match what you see in-game.\n" + "Timestamps shown in **your local timezone**.",
		fields: {
			seasonEnd: "📅 Season End",
			ruins: {
				name: "🏚️ Ancient Ruins",
				interval: "Repeats every **40 hours** until season end",
			},
			altar: {
				name: "🕯️ Altar of Darkness",
				interval: "Repeats every **86 hours** until season end",
			},
			kau: {
				name: "⚔️ Trial of Kau Karuak",
			},
			channel: "📢 Reminder Channel",
		},
	},

	error: {
		title: "❌ Error",
	},

	arrival: {
		title: "🔱 I Have Arrived.",
		description: (guildName: string, ownerId: string) =>
			`Greetings, <@${ownerId}>.\n\n` +
			`I have descended upon **${guildName}**.\n\n` +
			"Before I can establish my presence, " +
			"I require one thing from you:\n\n" +
			"**Run `/setup` in your server and " +
			"designate an admin role.**\n\n" +
			"Once done, 🔱 **BY DIVINE DECREE** will be " +
			"constructed and my throne established.\n\n" +
			"*Do not keep me waiting.*",
	},

	setup: {
		categoryName: "🔱 BY DIVINE DECREE",
		// appended to categoryName when NODE_ENV=development so a dev instance
		// sharing a guild with prod builds a visually distinct home base.
		// GuildSetupManager reads this and composes the final name. keeping the
		// string here rather than inlining the check means the wording stays
		// editable from one place alongside the rest of the kingdom voice.
		devSuffix: " (dev)",
		channels: {
			intro: "📜introductions",
			commands: "📖command-center",
			leaderboard: "🏆leaderboard",
			schedule: "📅event-schedule",
			announcements: "📢announcements",
			admin: "🔒inner-sanctum",
			// ── seventh homebase channel ──────────────────────────
			// What:  home of the NextUpBoard. A new post appears here
			//        whenever an event enters the 24h rolling horizon
			//        (or a same day group fires together as "today's
			//        decrees"). Each post is permanent audit trail —
			//        the bot never edits these.
			// Who:   NextUpBoard posts. GuildSetupManager provisions.
			// Where: sits beside 📢announcements in the homebase
			//        category; readable by mortals, writable only by
			//        the bot via category level overwrites.
			nextDecree: "🛡️next-decree",
		},
	},

	channelContent: {
		introduction: {
			title: "🔱 I Have Descended.",
			// What:  pinned intro embed that greets every mortal who enters
			//        the 📜introductions channel. Also doubles as the public
			//        pitch for anyone who wanders in from outside the
			//        alliance — the invite button sits right beneath this
			//        embed and the copy must earn a stranger's click.
			// Who:   every mortal in the guild + any outsider who has been
			//        shown the channel by a current member.
			// When:  posted once during /setup; edited in place by
			//        refreshIntroEmbeds on every boot so copy revisions
			//        land without re-running setup.
			// Where: paired with the "Summon me to your server, Mortal"
			//        link button composed in ChannelContent.introductionComponents().
			description:
				"Mortals of this alliance — I am your **ROK Commander**.\n\n" +
				"I do not serve out of kindness. I exist because " +
				"**my Creator has willed it so**.\n\n" +
				"Through me, you will be reminded of your duties. " +
				"Your deeds will be remembered. " +
				"Your effort, rewarded. " +
				"The worthy shall rise to glory.\n\n" +
				"**── What I Do ──**\n" +
				"⚔️ I'll remind you of important dates and events.\n" +
				"📺 Post stream / event reminders on a fixed schedule for any Discord community.\n" +
				"🏆 Rank the worthy on a living leaderboard.\n" +
				"📅 Keep a pinned schedule in sight at all times.\n\n" +
				"*Now. Let us build something legendary.*\n\n" +
				"**Command me in a realm of your own.** The button below shall summon me.",
		},

		// ── public #command-center guide ──────────────────────────
		// Members-only surface. Shows ONLY the commands any mortal can
		// run today: /leaderboard and /list-events. Admin commands have
		// been moved to commandContentAdmin below which is posted to
		// #inner-sanctum and gated by the admin role.
		commandGuide: {
			title: "📖 The Sacred Texts — Member Commands",
			// Description carries the beloved "tools of your trade / wield
			// with purpose / Impress me" line — restored 2026-04-24 after
			// it had been truncated during the public/admin split. Then a
			// blank line and a short "more may be unlocked" teaser so the
			// embed sets up the short command list below without feeling
			// empty.
			description:
				"The tools available to every mortal of this alliance. Go on — wield them with purpose. Learn them. Use them. **Impress me.**\n\n" +
				"More may be unlocked as you rise.",
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

		// ── #inner-sanctum admin command guide ────────────────────
		// Second pinned message in the admin channel. Posted alongside
		// adminWelcome and tracked separately on
		// GuildConfig.introMessageIds.adminCommandGuideId so
		// refreshIntroEmbeds can edit it in place on every boot.
		// Visibility is gated by the admin channel's role overwrite, so
		// mortals never see this content even if they stumble into a
		// leaked preview link.
		adminCommandGuide: {
			title: "🔒 The Inner Sanctum — Admin Command Guide",
			// Description matches the Member Commands voice: opens with
			// the "tools of your trade / wield / Impress me" line that
			// the owner specifically asked to preserve, then frames the
			// scope. Earlier draft ended with "I'll be watching either
			// way" which read as creepy surveillance; removed 2026-04-24.
			description:
				"These are the tools of your trade. Go on — wield them with purpose. Learn them. Use them. **Impress me.**\n\n" +
				"Commands reserved for those with the admin role.",
			// ── whitespace strategy ─────────────────────────────────
			// One blank line between sections. Commands within a section
			// list command name then description on two consecutive
			// lines, next command immediately after. This mirrors the
			// owner's target layout sketched out in the 2026-04-24
			// session (command on its own line, description on the next,
			// blank line between entire sections).
			fields: [
				{
					// ROK-specific commands grouped at top so alliance
					// leadership recognises their tools without scanning
					// the stream-adjacent blocks below.
					name: "⚔️ ROK KvK Commands",
					value: ["`/configure-kvk-season`", "ROK (Rise of Kingdoms) specific. Event reminders for a KvK season."].join("\n"),
				},
				{
					name: "📺 Stream / General Schedule Commands",
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
				"Upcoming KvK events will be displayed here once configured.\n\n" +
				"An admin must run `/configure-kvk-season` " +
				"to initialize the season schedule.",
		},

		leaderboard: {
			title: "🏆 Hall of the Worthy",
			description:
				"Alliance participation rankings will be posted here " +
				"after each event.\n\n" +
				"Every contribution counts. " +
				"The worthy earn their place at the top.",
		},

		announcements: {
			title: "📢 Announcements",
			description:
				"Event reminders and season announcements will be posted here.\n\n" + "*My decrees to the alliance will find you here.*",
		},

		// ── next decree intro ──────────────────────────────────────────
		// What:  pinned intro embed that sits above the NextUpBoard posts.
		//        Explains to mortals why this channel accumulates posts
		//        (as opposed to scheduleChannelId's single edited message).
		// Who:   ChannelContent.nextDecreeIntro() pulls from here.
		// Where: posted once by populateChannels on first setup; edited in
		//        place on every boot via refreshIntroEmbeds.
		nextDecree: {
			title: "🛡️ The Next Decree",
			description:
				"Herald of what comes next.\n\n" +
				"As each event nears within the next day, a fresh decree shall appear here — " +
				"its hour, its trial, and the preparations demanded of the worthy.\n\n" +
				"*These scrolls remain forever. Scroll back to prove your alliance was warned.*",
		},

		adminWelcome: {
			title: "🔱 The Inner Sanctum",
			description: (ownerId: string, adminRoleId: string) =>
				`Welcome, <@${ownerId}>. You have constructed my throne.\n\n` +
				`Members with <@&${adminRoleId}> may also operate ` +
				"from this chamber.\n\n" +
				"From here you may configure events, manage reminders, " +
				"and oversee your alliance.\n\n" +
				"*The noobs need not know this place exists.*",
		},

		// ── self heal notices ──────────────────────────────────────────
		// Posted to the inner sanctum at bot wake up when ensureHomebase
		// detects that one or more homebase channels were deleted while the
		// bot was offline. Kingdom voice matches the rest of the bot's
		// medieval Discord copy, but ends with a plain warning so the admin
		// understands the operational consequence.
		channelRepairNotice: {
			title: "🔧 A Chamber Has Been Restored",
			description: (channelName: string) =>
				`I noticed **${channelName}** had been razed from my castle. ` +
				"I have rebuilt it.\n\n" +
				"⚠️ Every chamber in **🔱 BY DIVINE DECREE** is load bearing. " +
				"If any are removed, I cannot function properly. " +
				"Do not delete them.",
		},
		castleRebuiltNotice: {
			title: "🔱 The Castle Has Been Rebuilt",
			description:
				"My homebase was gone when I awoke. " +
				"I have reconstructed **🔱 BY DIVINE DECREE** and every chamber within it.\n\n" +
				"⚠️ The entire category and its channels are load bearing. " +
				"Do not delete them. " +
				"Without them I cannot serve this alliance.",
		},
	},

	responses: {
		adminRolePending:
			"⚠️ **No admin role has been designated yet.**\n\n" + "Run `/setup` to assign a role that can configure this bot.",
		noWizardPowers:
			"⚠️ **Oops. You don't have wizard powers.**\n\n" +
			"This command is reserved for alliance commanders.\n" +
			"You are not one of them.",
		ownerOnly:
			"⚠️ **Oops. You don't have wizard powers.**\n\n" +
			"Only the server owner may establish " +
			"**🔱 BY DIVINE DECREE**.\n" +
			"Know your place.",
		alreadySetup:
			"🔱 **BY DIVINE DECREE already stands.**\n\n" +
			"My throne has already been constructed.\n" +
			"It does not need to be built twice.",
		setupSuccess: (adminRoleId: string) => ({
			title: "🔱 BY DIVINE DECREE Established",
			description:
				"🔱 **BY DIVINE DECREE has been established.**\n\n" +
				`<@&${adminRoleId}> has been granted access ` +
				"to the inner sanctum.\n\n" +
				"My presence is now known. Inform your alliance.\n" +
				"They should be grateful.",
		}),
		kvkConfigured: (seasonEnd: number, channelId: string) =>
			[
				"✅ **KvK reminders configured successfully!**",
				"",
				"**Events scheduled:**",
				"- 🏚️ Ancient Ruins *(every 40h)*",
				"- 🕯️ Altar of Darkness *(every 86h)*",
				"- ⚔️ Trial of Kau Karuak *(Easy → Normal → Hard → Nightmare)*",
				"",
				`**Season ends:** <t:${seasonEnd}:D>`,
				`**Reminder channel:** <#${channelId}>`,
			].join("\n"),
		setupFailed: "Something went wrong during setup. Please try again.",
		// shown to the admin when GuildEventManager.configureKvKSeason throws.
		// keeps the error vague on purpose: real diagnosis lives in the logs,
		// the user just needs to know to retry.
		kvkConfigureFailed: "❌ Something went wrong saving the configuration. Please try again.",
		// generic fallback surfaced when a slash command's execute handler
		// throws. logs have the stack; user sees a soft failure message.
		commandExecuteFailure: "Something went wrong executing this command.",
		// shown during /setup when the bot hasn't finished autoSetup yet (the
		// category + channels are still being constructed by the server).
		setupChannelsPending: "Channels not yet constructed. Please wait a moment and try again.",
		setupPending: {
			title: "🔱 Setting Up",
			description: "Constructing **BY DIVINE DECREE**... Stand by.",
		},
		setupRequired:
			"⚠️ **My throne has not been constructed.**\n\n" + "An admin must run `/setup` before any commands can be used.",
	},

	// ── streamer / general schedule copy ──────────────────────────
	// Copy lives on this same constants file (same audit point as the
	// kingdom voice) but speaks plainly. Streamers want a working
	// schedule, not a roleplay. Voice still leans casual gamer — Discord
	// communities skew that way and the streamer who first asked for the
	// bot is in that audience.
	streamSchedule: {
		setupRequired: "Run `/setup` first so the bot has an announcements channel to post in.",
		invalidTime: "Time invalid. Use 24h `HH:MM` like `19:30` or `09:00`.",
		invalidDay: "Day invalid. Pick one of: monday, tuesday, wednesday, thursday, friday, saturday, sunday.",
		alreadyExists: (name: string) =>
			`A schedule named **${name}** already exists. Pause it with \`/pause-schedule\` or pick a different name.`,
		// Confirmation embed that previews the schedule before persisting.
		// Times use Discord <t:UNIX:t> so each viewer sees their local time.
		confirm: {
			title: "📺 Confirm stream schedule",
			description: (name: string, dayLabel: string, nextOccurrenceUnix: number) =>
				[
					`**${name}** — every **${dayLabel}**.`,
					`Next stream: <t:${nextOccurrenceUnix}:F> (<t:${nextOccurrenceUnix}:R>)`,
					"",
					"Reminders fire at the offsets configured for this guild (default: 30 and 15 minutes before).",
				].join("\n"),
			// Three line summary of who gets pinged and where.
			audienceLine: (mentionRoleId: string | null, channelId: string) =>
				mentionRoleId ? `Pinging <@&${mentionRoleId}> in <#${channelId}>.` : `Pinging the guild member role in <#${channelId}>.`,
			// Optional auto-pause cap. Shown only when the streamer set a duration.
			autoPauseLine: (untilUnix: number) => `Auto-pauses on <t:${untilUnix}:F> (<t:${untilUnix}:R>) unless extended.`,
			confirmButtonLabel: "✅ Save schedule",
			cancelButtonLabel: "✖️ Cancel",
		},
		cancelled: "Cancelled. Nothing was saved.",
		timedOut: "Timed out. Run the command again when ready.",
		saved: (name: string) => `✅ **${name}** is live. The bot will post reminders before every stream.`,
		saveFailed: "Could not save the schedule. Try again — if it keeps failing, ping the bot owner.",
	},

	// ── pause / continue ──────────────────────────────────────────
	pauseSchedule: {
		notFound: "No schedule by that name. Use `/event-list` to see what is configured.",
		alreadyPaused: (name: string) => `**${name}** is already paused.`,
		paused: (name: string) => `⏸️ **${name}** paused. Resume with \`/continue-schedule name:${name}\`.`,
		pausedUntil: (name: string, untilUnix: number) =>
			`⏸️ **${name}** paused until <t:${untilUnix}:F> (<t:${untilUnix}:R>). It will resume automatically.`,
		invalidDuration: "Duration invalid. Use a positive number of days, max 90.",
		alreadyActive: (name: string) => `**${name}** is already active.`,
		resumed: (name: string) => `▶️ **${name}** resumed. Reminders will fire on the next scheduled time.`,
		failed: "Could not update the schedule. Try again.",
	},

	// ── /go-live-soon (panic button) ──────────────────────────────
	// Drops a one-off announcement for a stream starting in the next few
	// hours. NOT a recurring event — this is a single now-ish nudge, the
	// kind a streamer fires from the green room when life happened and
	// they did not pre-announce.
	goLiveSoon: {
		setupRequired: "Run `/setup` first so the bot has an announcements channel to post in.",
		invalidLeadTime: "Pick a lead time from the list (now / 10m / 30m / 1h / 3h / 6h).",
		// Renders inline in the announcement body. Streamer-typed `note`
		// is appended verbatim under this header (Discord will sanitize
		// the markdown but the bot still does not allowedMentions @everyone).
		announcementTitle: "📺 Going live soon",
		announcementBody: (leadLabel: string, startUnix: number, note: string | null) =>
			[`Stream starts **${leadLabel}** — <t:${startUnix}:t> (<t:${startUnix}:R>).`, note ? `\n${note}` : ""]
				.filter(Boolean)
				.join("\n"),
		posted: "✅ Announcement posted.",
		postFailed: "Could not post the announcement. Check bot permissions on the announcements channel.",
	},

	// ── feature announcements ─────────────────────────────────────
	// What:  once-per-version broadcast posted on boot. Two surfaces
	//        per guild: #announcements (godly pitch voice, public) and
	//        #inner-sanctum (plain admin voice, no ping). Keyed by the
	//        bot's package.json version, idempotent via botLogStore.
	// Who:   postFeatureAnnouncement reads this, once per (guild, version).
	// When:  on boot, after ensureHomebase + refreshIntroEmbeds +
	//        refreshAllSchedules, so everything else is settled before
	//        we broadcast. New guilds (setupComplete:false) are skipped
	//        — their intro embed tells them what the bot does; they do
	//        not need a "what's new" for features already live.
	// Where: copy lives here so a release-day edit is a one file change.
	//        Update BOTH public and innerSanctum together when shipping
	//        a new version; they describe the same release in two voices.
	featureAnnouncement: {
		// ── v1.4.0 — bug fix + decree editing release ─────────────
		// Lead with the apology. The 2026-04-24 spam tick where six
		// season-end embeds posted in one minute, plus the cadence
		// drift that misfired Ruins and Altar reminders, were both
		// real impacts on member experience. The kingdom-voice public
		// copy acknowledges the dissonance directly before pivoting
		// to the new edit surface. Inner-sanctum copy is the plain
		// admin changelog, lists the migration that already ran, and
		// closes with the new edit button operator notes.
		public: {
			title: "🛡️ Decree of Restoration",
			description:
				"Mortals — **my Creator has hunted down a pair of bugs that troubled the kingdom.**\n\n" +
				"What ailed the realm has been mended:\n\n" +
				"**⚙️ Decree timing has been corrected.**\n" +
				"Ancient Ruins now repeats every 40 hours, and Altar of Darkness every 86. The cadences match the kingdom's true schedule. If your reminders rang at the wrong hour these past weeks, that is why — and it shall not happen again.\n\n" +
				"**🪶 Season's end shall sound but once.**\n" +
				"Where the herald previously shouted six times to mark the close of a season, you shall hear it now exactly once.\n\n" +
				"**📜 The decree calendar reads cleaner.**\n" +
				"Completed events now rest in their own chapter. The season's end is bolded once at the top instead of repeated on every line.\n\n" +
				"**✏️ A new gift to those who lead.**\n" +
				"On the next-decree channel, those granted the bot's trust may now click `Edit` to shift a decree's time, title, or description on the fly.\n\n" +
				"*The realm regrets the disorder. Sharpen your blades.*",
		},
		innerSanctum: {
			title: "📓 v1.4.0 — Bug Fix and Decree Editing",
			description:
				"This release corrects two production bugs and adds a new admin surface.\n\n" +
				"**Fixes:**\n" +
				"• `Ancient Ruins` cadence: 36h → 40h.\n" +
				"• `Altar of Darkness` cadence: 84h → 86h.\n" +
				"• Both required a one-time MongoDB migration to correct existing events; that migration ran at deploy time and is idempotent on re-run.\n" +
				"• Season-end announcement now fires once per guild per season instead of once per active event (was firing 6× during the 2026-04-24 incident).\n\n" +
				"**New — decree editing:**\n" +
				"• `Edit` button on every next-decree post in 🛡️next-decree.\n" +
				"• Server owner plus members of the configured admin role can adjust title, description, or time on a single occurrence (`Apply to this fire only`) or as a permanent shift to the recurring anchor (`Apply to all future fires`).\n" +
				"• Time edits surface a 25-option timezone dropdown after modal submit; no IANA names to type.\n" +
				"• Schedule board redesign: completed events partitioned into their own section, season-end line bolded once at the top.\n" +
				"• Every edit writes to the `AuditLog` collection — `actor`, `before`, `after`, and scope.\n\n" +
				"**Nothing to do.** The fixes apply themselves. The edit button is opt-in per click.",
		},
	},

	// ── /announce-stream (planned standalone) ─────────────────────
	// Different from /go-live-soon: this is for a planned one-off stream
	// happening hours or days from now. Same primitive (one-time event),
	// stricter input (explicit date+time, optional title and description).
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
