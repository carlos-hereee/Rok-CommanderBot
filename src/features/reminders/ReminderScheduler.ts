import cron from "node-cron";
import { Client, TextChannel } from "discord.js";
import { eventStore } from "@db/stores/eventStore.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { getUpcomingOccurrences } from "@features/events/occurrenceCalculator.js";
import { fireReminder } from "./ReminderJob.js";
import { reminderStore } from "@db/stores/reminderStore.js";
import { BOT_CONSTANTS } from "@base/constants/BOT_CONSTANTS.js";
import { IGameEvent } from "../events/event.types.js";
import { seasonEndEmbed } from "@utils/embedBuilder.js";
import { refreshAllSchedules, refreshSchedule } from "@features/schedule/ScheduleBoard.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";

export function startScheduler(client: Client): void {
	// ── hourly schedule board safety tick ──
	// every event mutation and reminder fire already triggers a board
	// refresh, but this hourly sweep is the floor. if something failed
	// silently (Discord hiccup, stored messageId deleted, etc) the next
	// hour at minute :00 will re synchronize every guild. node-cron's
	// "0 * * * *" fires at the top of every hour.
	cron.schedule("0 * * * *", async () => {
		try {
			await refreshAllSchedules(client);
		} catch (error) {
			console.error(LOG_MESSAGES.schedule.hourlyRefreshFailed, error);
		}
	});

	cron.schedule(BOT_CONSTANTS.SCHEDULER_CRON, async () => {
		try {
			// ① fetch all active events from DB
			const events = await eventStore.findAll();

			for (const event of events) {
				const now = new Date();

				// ── auto-resume from paused ──────────────────────────────
				// Run BEFORE the paused skip check so a pause whose timer
				// just expired resumes on this same tick instead of waiting
				// one more cycle (a 60s delay is fine, but it would also
				// silently delay the very first reminder if the next
				// occurrence is also overdue — the cleaner contract is
				// "auto-resume always wins on the tick it fires"). Both
				// fields are cleared so the event behaves as if pause never
				// happened: ReminderScheduler can fire, ScheduleBoard drops
				// the paused tag on its next refresh.
				if (event.paused && event.pausedUntil && now.getTime() >= new Date(event.pausedUntil).getTime()) {
					await eventStore.update(event.eventId, { paused: false, pausedUntil: null });
					event.paused = false;
					event.pausedUntil = null;
					// fall through into the rest of the loop
				}

				// ── paused ───────────────────────────────────────────────
				// Streamers (and anyone else) can pause an event from the
				// dashboard or via /pause-schedule. Paused events stay in
				// the DB, still render on the schedule board (with a
				// "paused" tag rendered by ScheduleBoard), still appear in
				// /event-list — they simply skip the fire decision until
				// /continue-schedule flips paused back to false.
				//
				// Why this lives BEFORE the seasonEnd check: a paused
				// event whose seasonEnd happens to pass while it is paused
				// should NOT auto archive. The streamer paused on purpose;
				// archiving behind their back would silently destroy the
				// schedule they configured. Skipping the whole loop body
				// keeps both the season-end branch and the fire branch
				// inert until they explicitly resume.
				if (event.paused) continue;

				// ── season ended ─────────────────────────────────────────
				// Skip the season-end branch entirely for events without a
				// seasonEnd (regular announcements, announcementType
				// "regular"). Without this guard, new Date(null) becomes
				// 1970-01-01 and every regular event would get archived
				// and "season ended" announced on the very next tick. The
				// happy path (legacy KvK events with a real Date) is
				// unchanged.
				if (event.seasonEnd && now > new Date(event.seasonEnd)) {
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
			console.error(LOG_MESSAGES.scheduler.tickError, error);
		}
	});
}

async function announceSeasonEnd(client: Client, event: IGameEvent): Promise<void> {
	try {
		// resolve the same way as fireReminder: always the guild's configured
		// announcements channel, no per-event override.
		const config = await guildConfigStore.findByGuildId(event.guildId);
		const targetChannelId = config?.announcementsChannelId ?? null;
		if (!targetChannelId) {
			console.error(LOG_MESSAGES.scheduler.seasonEndNoChannel(event.guildId));
			return;
		}

		const channel = await client.channels.fetch(targetChannelId).catch(() => null);
		if (!channel || !(channel instanceof TextChannel)) return;

		// belt and suspenders: the caller already gates on event.seasonEnd
		// being truthy, so this assertion narrows the type for the two
		// new Date() calls below without a non-null bang. If we ever
		// reach here with a null value it is a programmer error upstream
		// and a thrown error is more useful than a silently corrupt
		// reminder log row keyed off the unix epoch.
		if (!event.seasonEnd) {
			console.error(LOG_MESSAGES.scheduler.seasonEndCalledWithoutDate(event.guildId, event.eventId));
			return;
		}

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
			channelId: targetChannelId,
			firedAt: new Date(),
		});

		// flip the pinned schedule board into its "season ended" state. fire
		// and forget so a Discord error here does not prevent the season end
		// log write above from being considered successful.
		refreshSchedule(client, event.guildId).catch((err) =>
			console.error(LOG_MESSAGES.schedule.refreshAfterSeasonEndFailed, err)
		);
	} catch (error) {
		console.error(LOG_MESSAGES.scheduler.seasonEndFailed, error);
	}
}
