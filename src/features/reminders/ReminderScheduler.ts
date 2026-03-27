import cron from "node-cron";
import { Client, TextChannel } from "discord.js";
import { eventStore } from "@db/stores/eventStore.js";
import { getUpcomingOccurrences } from "@features/events/occurrenceCalculator.js";
import { fireReminder } from "./ReminderJob.js";
import { reminderStore } from "@db/stores/reminderStore.js";
import { BOT_CONSTANTS } from "@base/constants/BOT_CONSTANTS.js";
import { IGameEvent } from "../events/event.types.js";
import { seasonEndEmbed } from "@utils/embedBuilder.js";

export function startScheduler(client: Client): void {
	cron.schedule(BOT_CONSTANTS.SCHEDULER_CRON, async () => {
		try {
			// ① fetch all active events from DB
			const events = await eventStore.findAll();

			for (const event of events) {
				const now = new Date();

				// ── season ended ─────────────────────────────────────────
				if (now > new Date(event.seasonEnd)) {
					await eventStore.update(event.eventId, { active: false });
					await announceSeasonEnd(client, event);
					continue;
				}

				if (event.type === "one-time") {
					// ── one-time events (kau karuak difficulties) ───────────
					for (const offsetMinutes of event.reminderOffsets) {
						const reminderTime = new Date(event.firstOccurrence.getTime() - offsetMinutes * 60 * 1000);
						const diff = reminderTime.getTime() - now.getTime();

						if (diff < 0 || diff > BOT_CONSTANTS.REMINDER_FIRE_WINDOW_MS) continue;

						const alreadyFired = await reminderStore.exists({
							eventId: event.eventId,
							eventOccurrence: event.firstOccurrence,
							offsetMinutes,
						});
						if (alreadyFired) continue;

						await fireReminder(client, event, event.firstOccurrence, offsetMinutes);

						// deactivate after the last reminder fires
						// so it doesn't keep getting checked every tick
						if (offsetMinutes === Math.min(...event.reminderOffsets)) {
							await eventStore.update(event.eventId, { active: false });
						}
					}
				} else {
					// ── recurring events (ruins, altar) ────────────────────
					const [nextOccurrence] = getUpcomingOccurrences(event, 1);
					if (!nextOccurrence) continue;

					for (const offsetMinutes of event.reminderOffsets) {
						const reminderTime = new Date(nextOccurrence.getTime() - offsetMinutes * 60 * 1000);
						const diff = reminderTime.getTime() - now.getTime();

						if (diff < 0 || diff > BOT_CONSTANTS.REMINDER_FIRE_WINDOW_MS) continue;

						const alreadyFired = await reminderStore.exists({
							eventId: event.eventId,
							eventOccurrence: nextOccurrence,
							offsetMinutes,
						});
						if (alreadyFired) continue;

						await fireReminder(client, event, nextOccurrence, offsetMinutes);
					}
				}
			}
		} catch (error) {
			console.error("Scheduler error:", error);
		}
	});
}

async function announceSeasonEnd(client: Client, event: IGameEvent): Promise<void> {
	try {
		const channel = await client.channels.fetch(event.channelId).catch(() => null);
		if (!channel || !(channel instanceof TextChannel)) return;

		// check if we already announced for this event
		// prevents announcing multiple times if cron ticks again
		const alreadyAnnounced = await reminderStore.exists({
			eventId: event.eventId,
			eventOccurrence: new Date(event.seasonEnd),
			offsetMinutes: -1, // ← -1 is a special marker meaning "season end announcement"
		});
		if (alreadyAnnounced) return;

		const embed = seasonEndEmbed();

		await channel.send({ embeds: [embed] });

		// log it so we never announce twice
		await reminderStore.create({
			eventId: event.eventId,
			eventOccurrence: new Date(event.seasonEnd),
			offsetMinutes: -1, // ← same special marker
			messageId: "season-end",
			channelId: event.channelId,
			firedAt: new Date(),
		});
	} catch (error) {
		console.error("Failed to announce season end:", error);
	}
}
