import { ChatInputCommandInteraction } from "discord.js";
import { BOT_CONSTANTS } from "@base/constants/BOT_CONSTANTS.js";
import { eventStore } from "@db/stores/eventStore.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import rokEvents from "@base/constants/rok-events.json" with { type: "json" };
import { v4 } from "uuid";
import { embedContent } from "@base/constants/embed-content.js";
import { refreshSchedule } from "@features/schedule/ScheduleBoard.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";

interface IKvKSeasonInput {
	seasonEnd: Date;
	ruinsFirst: Date;
	altarFirst: Date;
	kauEasy: Date;
	kauNormal: Date;
	kauHard: Date;
	kauNightmare: Date;
	// NOTE: channelId intentionally removed. source of truth is
	// guildConfig.announcementsChannelId, resolved at fire time by ReminderJob.
}

export class GuildEventManager {
	static async configureKvKSeason(interaction: ChatInputCommandInteraction, input: IKvKSeasonInput): Promise<void> {
		try {
			const guildId = interaction.guildId!;

			// read the announcements channel once for the reply footer. the
			// event rows themselves do not store a channelId anymore — that
			// would freeze the channel into stale data if the admin later
			// reconfigures the home base. ReminderJob reads GuildConfig fresh
			// every tick.
			const config = await guildConfigStore.findByGuildId(guildId);
			const announcementsChannelId = config?.announcementsChannelId ?? "";

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
					// channelId intentionally omitted — falls back to
					// guildConfig.announcementsChannelId at fire time
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
					// channelId intentionally omitted — see note above
					guildId,
					prepSteps: config.prepSteps.map((step) => ({ ...step, id: v4() })),
					active: true,
				});
			}

			await interaction.editReply({
				content: embedContent.responses.kvkConfigured(
					Math.floor(input.seasonEnd.getTime() / 1000),
					announcementsChannelId
				),
			});

			// refresh the pinned schedule board now that events exist. fire
			// and forget — the admin's reply has already gone out and the
			// schedule is eventually consistent via the hourly safety tick.
			refreshSchedule(interaction.client, guildId).catch((err) =>
				console.error(LOG_MESSAGES.schedule.refreshAfterConfigureFailed, err)
			);
		} catch (error) {
			console.error(LOG_MESSAGES.guildEvent.configureKvkFailed, error);
			await interaction.editReply({
				content: embedContent.responses.kvkConfigureFailed,
			});
		}
	}
}
