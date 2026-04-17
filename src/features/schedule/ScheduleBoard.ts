import { Client, TextChannel, Message, DiscordAPIError } from "discord.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { eventStore } from "@db/stores/eventStore.js";
import { scheduleBoardEmbed, IScheduleField } from "@utils/embedBuilder.js";
import { getUpcomingOccurrences } from "@features/events/occurrenceCalculator.js";
import { IGameEvent } from "@features/events/event.types.js";

// ── ScheduleBoard ─────────────────────────────────────────────────────
// Owns a single pinned message per guild that lives in the event-schedule
// channel created during /setup. The message is kept in sync with the
// active events for the guild. All call sites that mutate events or fire
// reminders trigger a refresh, plus a startup sweep and an hourly safety
// tick in ReminderScheduler.
//
// Invariants:
//  1. One message per guild. Stored on GuildConfig.scheduleMessageId.
//  2. Edit in place whenever possible. If the message was deleted by an
//     admin we recover by posting a new one and updating the stored id.
//  3. Never throw. Refresh failures are logged and swallowed so they
//     cannot block the triggering action (event create, reminder fire,
//     etc).
//  4. If the guild has not finished /setup (no scheduleChannelId) we bail
//     quietly. Setup will reach its own terminal state eventually.

/**
 * Refresh the schedule board for a single guild. Safe to call fire and
 * forget — swallows any error and logs it. Returns nothing.
 */
export async function refreshSchedule(client: Client, guildId: string): Promise<void> {
	try {
		const config = await guildConfigStore.findByGuildId(guildId);
		if (!config?.scheduleChannelId) {
			// guild has not finished its home base build yet. silent bail is
			// correct — autoSetup will take care of this state transition.
			return;
		}

		const channel = await client.channels.fetch(config.scheduleChannelId).catch(() => null);
		if (!channel || !(channel instanceof TextChannel)) {
			console.error(`[schedule] schedule channel ${config.scheduleChannelId} not found or not a TextChannel for guild ${guildId}`);
			return;
		}

		const events = await eventStore.findByGuildId(guildId);
		const now = new Date();
		const seasonEnded =
			events.length > 0 && events.every((e) => new Date(e.seasonEnd).getTime() <= now.getTime());

		const fields: IScheduleField[] = events
			.map((event) => toField(event as IGameEvent))
			// chronological sort so warriors see the soonest event first.
			// events with no upcoming occurrence (null ts) sink to the bottom.
			.sort((a, b) => {
				if (a.nextOccurrenceTs === null && b.nextOccurrenceTs === null) return 0;
				if (a.nextOccurrenceTs === null) return 1;
				if (b.nextOccurrenceTs === null) return -1;
				return a.nextOccurrenceTs - b.nextOccurrenceTs;
			});

		const embed = scheduleBoardEmbed(fields, config.announcementsChannelId ?? null, { seasonEnded });

		await postOrEdit(channel, config.scheduleMessageId ?? null, embed, guildId);
	} catch (error) {
		console.error(`[schedule] unexpected error refreshing guild ${guildId}:`, error);
	}
}

/**
 * Refresh every guild the bot is installed in. Used on bot startup and
 * by the hourly cron tick in ReminderScheduler. Errors in any single
 * guild do not stop the sweep.
 */
export async function refreshAllSchedules(client: Client): Promise<void> {
	for (const [guildId] of client.guilds.cache) {
		await refreshSchedule(client, guildId);
	}
}

// ── private helpers ────────────────────────────────────────────────────

function toField(event: IGameEvent): IScheduleField {
	const [next] = getUpcomingOccurrences(event, 1);

	// for one-time events whose firstOccurrence is still in the future,
	// getUpcomingOccurrences returns [firstOccurrence]. once that date
	// passes it returns []. the null branch below shows _awaiting next
	// season_ in the embed.
	const nextOccurrenceTs = next ? Math.floor(next.getTime() / 1000) : null;

	return {
		name: event.name,
		type: event.type,
		nextOccurrenceTs,
		intervalHours: event.type === "recurring" ? event.intervalHours : null,
		seasonEndTs: Math.floor(new Date(event.seasonEnd).getTime() / 1000),
	};
}

async function postOrEdit(
	channel: TextChannel,
	existingMessageId: string | null,
	embed: ReturnType<typeof scheduleBoardEmbed>,
	guildId: string
): Promise<void> {
	// happy path: edit the existing message.
	if (existingMessageId) {
		try {
			const existing = await channel.messages.fetch(existingMessageId);
			await existing.edit({ embeds: [embed] });
			return;
		} catch (error) {
			// 10008 Unknown Message → someone deleted it. 10003 Unknown Channel
			// → channel was wiped. we recover by falling through to the post path.
			if (error instanceof DiscordAPIError && (error.code === 10008 || error.code === 10003)) {
				console.warn(`[schedule] stored scheduleMessageId ${existingMessageId} was deleted for guild ${guildId}. reposting.`);
			} else {
				console.error(`[schedule] failed to edit scheduleMessageId ${existingMessageId} for guild ${guildId}:`, error);
				// do not fall through on unknown errors. another refresh will retry.
				return;
			}
		}
	}

	// recovery path (or first post ever): send a new message, pin it, persist the id.
	let message: Message;
	try {
		message = await channel.send({ embeds: [embed] });
	} catch (error) {
		console.error(`[schedule] failed to post schedule message for guild ${guildId}:`, error);
		return;
	}

	try {
		await message.pin();
	} catch (error) {
		// pinning is a nice to have. if the bot lacks ManageMessages the
		// board still works, the message just floats in recent history.
		console.warn(`[schedule] pin failed for guild ${guildId} (likely missing ManageMessages):`, error);
	}

	await guildConfigStore.update(guildId, { scheduleMessageId: message.id });
}
