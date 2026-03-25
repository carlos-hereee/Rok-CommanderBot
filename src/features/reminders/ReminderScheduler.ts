import cron from "node-cron";
import { Client } from "discord.js";
import { eventStore } from "@db/stores/eventStore.js";
import { getUpcomingOccurrences } from "@features/events/occurrenceCalculator.js";
import { fireReminder } from "./ReminderJob.js";
import { reminderStore } from "@db/stores/reminderStore.js";
import { BOT_CONSTANTS } from "@base/constants/BOT_CONSTANTS.js";

export function startScheduler(client: Client): void {
  cron.schedule(BOT_CONSTANTS.SCHEDULER_CRON, async () => {
    try {
      // ① fetch all active events from DB
      const events = await eventStore.findAll();

      for (const event of events) {
        // ② for each event, get its upcoming occurrences
        const occurrences = getUpcomingOccurrences(event, 1);
        const nextOccurrence = occurrences[0];
        if (!nextOccurrence) continue;

        // ③ check each reminder offset e.g. 30min and 15min
        for (const offsetMinutes of event.reminderOffsets) {
          const reminderTime = new Date(
            nextOccurrence.getTime() - offsetMinutes * 60 * 1000
          );
          const now = new Date();
          const diff = reminderTime.getTime() - now.getTime();

          // ④ only fire if we're within the current cron window
          if (diff < 0 || diff > BOT_CONSTANTS.REMINDER_FIRE_WINDOW_MS) continue;

          // ⑤ check if we already fired this exact reminder
          // this prevents duplicate posts if the cron somehow ticks twice
          const alreadyFired = await reminderStore.exists({
            eventId: event.eventId,
            eventOccurrence: nextOccurrence,
            offsetMinutes,
          });
          if (alreadyFired) continue;

          // ⑥ all checks passed — fire it
          await fireReminder(client, event, nextOccurrence, offsetMinutes);
        }
      }
    } catch (error) {
      console.error("Scheduler error:", error);
    }
  });
}