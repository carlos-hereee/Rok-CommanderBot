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
	} satisfies Record<string, ColorResolvable>,

	reminder: {
		title: (name: string, minutes: number) => `⚔️ ${name} starts in ${minutes} minutes!`,
		description: "Prepare now so you're ready when the event begins.",
		checklistField: "📋 Preparation Checklist",
		timeField: "🕐 Event Time",
	},

	seasonEnd: {
		title: "🏁 KvK Season Has Ended",
		description:
			"The KvK season has concluded. Reminders have been stopped.\n\n" +
			"Run `/configure-rok-reminders` when the next season begins.",
	},

	leaderboard: {
		title: (name: string) => `🏆 ${name} — Leaderboard`,
		footer: "Full leaderboard available on the admin dashboard",
		row: (medal: string, username: string, score: number, events: number, acknowledged: number) =>
			`${medal} **${username}**\n` + `Score: ${score} | ` + `Events: ${events} | ` + `Reminders acknowledged: ${acknowledged}`,
		medals: ["🥇", "🥈", "🥉"],
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
		channels: {
			intro: "📜introductions",
			commands: "📖command-center",
			leaderboard: "🏆leaderboard",
			schedule: "📅event-schedule",
			announcements: "📢announcements",
			admin: "🔒inner-sanctum",
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
				"Your presence at events will be tracked. " +
				"Your performance will be judged. " +
				"The worthy shall rise. The absent shall be forgotten.\n\n" +
				"You did not summon me. You were **chosen**.\n\n" +
				"*Now. Get to work.*",
		},

		commandGuide: {
			title: "📖 The Sacred Texts — Command Guide",
			description: "These are the commands I have graciously made available.\n" + "Study them well. I will not repeat myself.",
			fields: [
				{
					name: "⚔️ Event Commands",
					value: [
						"`/configure-rok-reminders` — Configure KvK event reminders",
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
				"An admin must run `/configure-rok-reminders` " +
				"to initialize the season schedule.",
		},

		leaderboard: {
			title: "🏆 Hall of the Worthy",
			description:
				"Alliance participation rankings will be posted here " +
				"after each event.\n\n" +
				"Your presence is tracked. " +
				"Your voice activity is tracked. " +
				"Your acknowledgement of reminders is tracked.\n\n" +
				"*There is nowhere to hide.*",
		},

		announcements: {
			title: "📢 Announcements",
			description: "Event reminders and season announcements will be posted here.\n\n" + "When I speak — you listen.",
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
	},

	responses: {
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
		setupPending: {
			title: "🔱 Setting Up",
			description: "Constructing **BY DIVINE DECREE**... Stand by.",
		},
		setupRequired:
			"⚠️ **My throne has not been constructed.**\n\n" + "An admin must run `/setup` before any commands can be used.",
	},
};
