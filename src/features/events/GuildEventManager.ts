import { ChatInputCommandInteraction } from "discord.js";
import { BOT_CONSTANTS } from "@base/constants/BOT_CONSTANTS.js";
import { eventStore } from "@db/stores/eventStore.js";
import rokEvents from "@base/constants/rok-events.json" assert { type: "json" };
import { v4 } from "uuid";

interface IKvKSeasonInput {
	seasonEnd: Date;
	ruinsFirst: Date;
	altarFirst: Date;
	kauEasy: Date;
	kauNormal: Date;
	kauHard: Date;
	kauNightmare: Date;
	channelId: string;
}

export class GuildEventManager {
	static async configureKvKSeason(interaction: ChatInputCommandInteraction, input: IKvKSeasonInput): Promise<void> {
		try {
			const guildId = interaction.guildId!;

			// ── recurring events ─────────────────────────────────
			const recurringEvents = [
				{ key: "ruins", firstOccurrence: input.ruinsFirst },
				{ key: "altar_of_darkness", firstOccurrence: input.altarFirst },
			];

			for (const { key, firstOccurrence } of recurringEvents) {
				const config = rokEvents.events.find((e) => e.key === key)!;

				await eventStore.create({
					name: config.name,
					description: "",
					type: "recurring",
					intervalHours: config.intervalHours,
					firstOccurrence,
					seasonEnd: input.seasonEnd,
					reminderOffsets: [...BOT_CONSTANTS.DEFAULT_REMINDER_OFFSETS],
					channelId: input.channelId,
					guildId,
					prepSteps: config.prepSteps.map((step) => ({ ...step, id: v4() })),
					active: true,
				});
			}

			// ── kau karuak one-time events ────────────────────────
			const kauOccurrences = [
				{ key: "kau_karuak_easy", date: input.kauEasy },
				{ key: "kau_karuak_normal", date: input.kauNormal },
				{ key: "kau_karuak_hard", date: input.kauHard },
				{ key: "kau_karuak_nightmare", date: input.kauNightmare },
			];

			for (const { key, date } of kauOccurrences) {
				const config = rokEvents.events.find((e) => e.key === key)!;

				await eventStore.create({
					name: config.name,
					description: "",
					type: "one-time",
					intervalHours: 0,
					firstOccurrence: date,
					seasonEnd: input.seasonEnd,
					reminderOffsets: [...BOT_CONSTANTS.DEFAULT_REMINDER_OFFSETS],
					channelId: input.channelId,
					guildId,
					prepSteps: config.prepSteps.map((step) => ({ ...step, id: v4() })),
					active: true,
				});
			}

			await interaction.editReply({
				content: [
					"✅ **KvK reminders configured successfully!**",
					"",
					"**Events scheduled:**",
					"- 🏚️ Ancient Ruins *(every 36h)*",
					"- 🕯️ Altar of Darkness *(every 84h)*",
					"- ⚔️ Trial of Kau Karuak *(Easy → Normal → Hard → Nightmare)*",
					"",
					`**Season ends:** <t:${Math.floor(input.seasonEnd.getTime() / 1000)}:D>`,
					`**Reminder channel:** <#${input.channelId}>`,
				].join("\n"),
			});
		} catch (error) {
			console.error("Failed to configure KvK season:", error);
			await interaction.editReply({
				content: "❌ Something went wrong saving the configuration. Please try again.",
			});
		}
	}
}
