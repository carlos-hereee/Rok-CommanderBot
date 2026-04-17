import { Client, TextChannel } from "discord.js";
import { IGameEvent } from "@features/events/event.types.js";
import { reminderStore } from "@db/stores/reminderStore.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { reminderEmbed } from "@utils/embedBuilder.js";

export async function fireReminder(client: Client, event: IGameEvent, occurrence: Date, offsetMinutes: number): Promise<void> {
	// ① resolve the destination channel. source of truth is the guild's
	// configured announcements channel. the event.channelId field only wins
	// when an admin has explicitly set a per-event override (v1.1 feature).
	// if neither is present we bail out — there is no sensible fallback and
	// blindly posting to a wrong channel would be worse than missing a fire.
	const config = await guildConfigStore.findByGuildId(event.guildId);
	if (!config) {
		console.error(`[reminder] no GuildConfig for guild ${event.guildId} — skipping fire`);
		return;
	}

	const targetChannelId = event.channelId ?? config.announcementsChannelId;
	if (!targetChannelId) {
		console.error(`[reminder] no announcements channel configured for guild ${event.guildId} — skipping fire`);
		return;
	}

	const channel = await client.channels.fetch(targetChannelId);
	if (!channel || !(channel instanceof TextChannel)) {
		console.error(`Channel ${targetChannelId} not found or not a text channel`);
		return;
	}

	// ② build the embed
	const embed = reminderEmbed(event, occurrence, offsetMinutes);

	// ③ compose the mention. we ping the configured member role so only
	// warriors opted into the alliance see the notification. if the guild
	// has not yet assigned a member role (legacy configs from before /setup
	// required it), fall back to @here so the reminder is not silent.
	const mention = config.memberRoleId ? `<@&${config.memberRoleId}>` : "@here";

	// ④ post the message. allowedMentions is set explicitly so a malformed
	// event description cannot accidentally ping @everyone.
	const message = await channel.send({
		content: mention,
		embeds: [embed],
		allowedMentions: config.memberRoleId ? { roles: [config.memberRoleId] } : { parse: ["everyone"] },
	});

	// ⑤ add the acknowledgement reaction
	await message.react("✅");

	// ⑥ log to DB — this is what prevents duplicate fires
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
      ├── resolve channel from GuildConfig.announcementsChannelId
      ├── build embed
      ├── post message with role ping + react ✅
      └── reminderStore.create() ← write LAST, so failures are retryable

      */
