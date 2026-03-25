import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { IGameEvent } from "@features/events/event.types.js";
import { reminderStore } from "@db/stores/reminderStore";


export async function fireReminder(
    client: Client,
    event: IGameEvent,
    occurrence: Date,
    offsetMinutes: number
): Promise<void> {

    // ① fetch the channel
    const channel = await client.channels.fetch(event.channelId);
    if (!channel || !(channel instanceof TextChannel)) {
        console.error(`Channel ${event.channelId} not found or not a text channel`);
        return;
    }

    // ② build the embed
    const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${event.name} starts in ${offsetMinutes} minutes!`)
        .setDescription("Prepare now so you're ready when the event begins.")
        .setColor("Red")
        .addFields(
            {
                name: "📋 Preparation Checklist",
                value: event.prepSteps
                    .sort((a, b) => a.order - b.order)
                    .map((step, i) => `${i + 1}. ${step.label}`)
                    .join("\n"),
            },
            {
                name: "🕐 Event Time",
                // Discord timestamp — renders in each user's local timezone automatically
                value: `<t:${Math.floor(occurrence.getTime() / 1000)}:F>`,
            }
        )
        .setTimestamp();

    // ③ post the message
    const message = await channel.send({
        content: "@here",
        embeds: [embed],
    });

    // ④ add the acknowledgement reaction
    await message.react("✅");

    // ⑤ log to DB — this is what prevents duplicate fires
    // and what the ActivityTracker uses to link reactions back to events
    await reminderStore.create({
        eventId: event.eventId,
        eventOccurrence: occurrence,
        offsetMinutes,
        messageId: message.id,
        channelId: channel.id,
        firedAt: new Date(),
    });
}

/*

**Why the DB write happens last:**

The order here is intentional — post to Discord first, then write to DB. 
If you did it in reverse and the Discord post failed, you'd have a DB record
saying the reminder fired when it never did, and the duplicate check would 
block it from ever retrying. Failing fast before writing means a failed post 
is always retryable on the next cron tick.

**Why Discord timestamps (`<t:...:F>`):**

Discord renders `<t:UNIX_TIMESTAMP:F>` in each user's own local timezone automatically. 
So a Spanish speaker and an Arabic speaker in different timezones both see the event time 
correctly without you doing any timezone math.

---

## The full picture as one sequence

ClientReady fires
      │
      ▼
startScheduler(client)
      │
      ▼  every 60 seconds
cron.schedule ticks
      │
      ▼
eventStore.findAll()          ← what events exist?
      │
      ▼
getUpcomingOccurrences()      ← when is the next one? (pure math, no DB)
      │
      ▼
diff within fire window?
      ├── NO  → skip, wait for next tick
      └── YES ▼
      
reminderStore.exists()        ← did we already fire this one?
      ├── YES → skip (duplicate protection)
      └── NO  ▼

fireReminder()
      ├── fetch channel
      ├── build embed
      ├── post message + react ✅
      └── reminderStore.create() ← write LAST, so failures are retryable

      */