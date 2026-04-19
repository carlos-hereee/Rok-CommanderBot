import { ColorResolvable } from "discord.js";

// ── types ─────────────────────────────────────────────────────
interface IEmbedField {
	name: string;
	value: string;
}

// ── content ───────────────────────────────────────────────────
export const embedContent = {
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
			"Run `/configure-kvk-season` to set up the season schedule.",
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
		title: "🏁 KvK Season Has Ended",
		description:
			"The KvK season has concluded. Reminders have been stopped.\n\n" +
			"Run `/configure-kvk-season` when the next season begins.",
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
		seasonEndLabel: "Season ends",
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
		checklistEmptyError:
			"❌ Checklist cannot be empty. Customize requires at least one item, or use Accept defaults instead.",
		checklistPromptTimedOut: "⏱️ Checklist prompt timed out — defaults were applied to every event.",
	},
	kvkConfirmation: {
		title: "⚔️ KvK Reminder Configuration — Please Confirm",
		description: "Verify these dates match what you see in-game.\n" + "Timestamps shown in **your local timezone**.",
		fields: {
			seasonEnd: "📅 Season End",
			ruins: {
				name: "🏚️ Ancient Ruins",
				interval: "Repeats every **36 hours** until season end",
			},
			altar: {
				name: "🕯️ Altar of Darkness",
				interval: "Repeats every **84 hours** until season end",
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
			description:
				"Mortals of this alliance — I am your **ROK Commander**.\n\n" +
				"I do not serve out of kindness. I exist because " +
				"**my Creator has willed it so**.\n\n" +
				"Through me, you will be reminded of your duties. " +
				"Your deeds will be remembered. " +
				"Your effort, rewarded. " +
				"The worthy shall rise to glory.\n\n" +
				"You did not summon me. You were **chosen**.\n\n" +
				"*Now. Let us build something legendary.*",
		},

		commandGuide: {
			title: "📖 The Sacred Texts — Command Guide",
			description:
				"These are the tools of your trade. Go on — wield them with purpose.\n" + "Learn them. Use them. **Impress me.**",
			fields: [
				{
					name: "⚔️ Event Commands",
					value: [
						"`/configure-kvk-season` — Configure KvK event reminders",
						"`/list-events` — View all configured events",
						"`/delete-event` — Remove a configured event",
					].join("\n"),
				},
				{
					name: "🏆 Leaderboard Commands",
					value: "`/leaderboard` — View participation rankings",
				},
				{
					name: "🔒 Admin Only",
					value:
						"The above commands require the designated admin role.\n" + "If you lack the role — you lack the authority. Simple.",
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
				"- 🏚️ Ancient Ruins *(every 36h)*",
				"- 🕯️ Altar of Darkness *(every 84h)*",
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
};
