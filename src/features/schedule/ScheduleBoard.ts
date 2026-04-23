import { Client, TextChannel, Message, DiscordAPIError } from "discord.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { eventStore } from "@db/stores/eventStore.js";
import { scheduleBoardEmbed, IScheduleField } from "@utils/embedBuilder.js";
import { getUpcomingOccurrences } from "@features/events/occurrenceCalculator.js";
import { IGameEvent } from "@features/events/event.types.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";
import { GuildSetupManager } from "@features/setup/GuildSetupManager.js";

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
			console.error(LOG_MESSAGES.schedule.channelMissing(config.scheduleChannelId, guildId));
			return;
		}

		const events = await eventStore.findByGuildId(guildId);
		const now = new Date();
		// Season ended state only applies to KvK events. Regular announcements
		// (seasonEnd null/undefined) are filtered out of the calculation
		// entirely because they have no season scope. Truthy check covers
		// both null and the undefined Mongoose returns when the field was
		// never set on a document. If a guild has only regular events the
		// schedule never enters the "season ended" rendering.
		const kvkEvents = events.filter((e) => Boolean(e.seasonEnd));
		const seasonEnded = kvkEvents.length > 0 && kvkEvents.every((e) => new Date(e.seasonEnd as Date).getTime() <= now.getTime());

		const fields: IScheduleField[] = events
			.map((event) => toField(event as IGameEvent))
			// chronological sort so Mortals see the soonest event first.
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
		console.error(LOG_MESSAGES.schedule.unexpectedError(guildId), error);
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

	// Regular announcements have no seasonEnd, so we omit the timestamp
	// (null) and the embed builder hides the "Season ends" line for that
	// row. KvK events keep the historical behavior — a unix timestamp
	// rendered as a Discord <t:…:D> date in the embed.
	const seasonEndTs = event.seasonEnd ? Math.floor(new Date(event.seasonEnd).getTime() / 1000) : null;

	return {
		name: event.name,
		type: event.type,
		nextOccurrenceTs,
		intervalHours: event.type === "recurring" ? event.intervalHours : null,
		seasonEndTs,
		// Forward the live paused flag straight to the embed builder.
		// Truthy paused renders the row with a "paused" tag and a pause
		// notice line; falsy/absent leaves the row visually identical to
		// the legacy KvK rendering.
		paused: event.paused,
	};
}

async function postOrEdit(
	channel: TextChannel,
	existingMessageId: string | null,
	embed: ReturnType<typeof scheduleBoardEmbed>,
	guildId: string
): Promise<void> {
	// resolve our own bot id up front so the stale data guards below can
	// compare authors cheaply without hitting Discord twice.
	const selfId = channel.client.user?.id;

	// happy path: edit the existing message.
	if (existingMessageId) {
		// What: track whether the stored id turned out to be stale (wrong
		//       author or 50005 from Discord). When set, we drop into the
		//       self heal block below which clears the persisted id and
		//       falls through to the post path.
		// Who:  the owner runs separate Mongo databases for dev and prod, so
		//       a mismatched author always means stale data (rotated bot
		//       account, DB seeded from a sibling environment, etc) and never
		//       a legitimate "another bot owns this" scenario.
		// When: at most once per stale id per guild. After self heal the new
		//       message id belongs to this bot and subsequent refreshes
		//       follow the edit path normally.
		let staleAuthor = false;

		try {
			const existing = await channel.messages.fetch(existingMessageId);

			// pre check: compare authorship before paying the round trip
			// cost of an edit that Discord will reject with 50005.
			if (selfId && existing.author.id !== selfId) {
				staleAuthor = true;
			} else {
				await existing.edit({ embeds: [embed] });
				return;
			}
		} catch (error) {
			// 10008 Unknown Message → admin deleted it. 10003 Unknown Channel
			// → channel was wiped. 50005 → cache race: pre check missed the
			// authorship mismatch but Discord caught it. all three resolve the
			// same way: clear the persisted id, drop into the post path, post
			// a fresh message we own.
			if (error instanceof DiscordAPIError && (error.code === 10008 || error.code === 10003)) {
				console.warn(LOG_MESSAGES.schedule.storedMessageDeleted(existingMessageId, guildId));
			} else if (error instanceof DiscordAPIError && error.code === 50005) {
				staleAuthor = true;
			} else {
				console.error(LOG_MESSAGES.schedule.editFailed(existingMessageId, guildId), error);
				// do not fall through on unknown errors. another refresh will retry.
				return;
			}
		}

		if (staleAuthor) {
			// What: the whole homebase in this guild's GuildConfig belongs to
			//       a different bot (rotated token, stale data from a sibling
			//       environment, or a prior shared-DB era). the bot must NOT
			//       post in that channel — that would pollute the other bot's
			//       home base.
			// Who:  detected by author mismatch on the stored scheduleMessageId
			//       (either pre-check or Discord 50005).
			// When: at most once per guild per stale-data lifetime. the recovery
			//       writes a fresh GuildConfig, so subsequent refreshes hit the
			//       happy edit path.
			// Where: flows into rebuildHomebase below which deletes the stale
			//        config and runs autoSetup to create this bot's own (dev)
			//        suffixed category and channels. the old channels stay
			//        untouched in Discord because they belong to the other bot.
			// How:   return from postOrEdit without posting. rebuildHomebase is
			//        awaited inside the caller so we don't fall through to the
			//        post path in the wrong channel.
			console.warn(LOG_MESSAGES.schedule.staleAuthor(existingMessageId, guildId));
			await rebuildHomebase(channel.guild, guildId);
			return;
		}
	}

	// recovery path (or first post ever): send a new message, pin it, persist the id.
	let message: Message;
	try {
		message = await channel.send({ embeds: [embed] });
	} catch (error) {
		console.error(LOG_MESSAGES.schedule.postFailed(guildId), error);
		return;
	}

	try {
		await message.pin();
	} catch (error) {
		// pinning is a nice to have. if the bot lacks ManageMessages the
		// board still works, the message just floats in recent history.
		console.warn(LOG_MESSAGES.schedule.pinFailed(guildId), error);
	}

	await guildConfigStore.update(guildId, { scheduleMessageId: message.id });
}

// ── rebuildHomebase ────────────────────────────────────────────────────
// What: recovery from the "GuildConfig in my DB points to a homebase that
//       is no longer ours" state. Runs autoSetup with force:true so a fresh
//       category and channels owned by THIS bot are built. Critically does
//       NOT call deleteByGuildId — in the shared MongoDB cluster scenario
//       (dev and prod bots pointed at the same collection) that delete
//       would nuke the other bot's row. Foreign rows are never touched.
// Who:  called from postOrEdit when the stored schedule message is authored
//       by a different bot, and from any other caller that detects the
//       same invariant violation in the future.
// When: rare. only fires when DB data is stale against reality (rotated
//       bot account, cross-environment seeding, manual DB edits, or two
//       bots sharing a Mongo collection).
// Where: leaves the OLD category/channels in Discord untouched — they
//        belong to the other bot and we have no right to delete them.
//        the new category picks up the "(dev)" suffix automatically via
//        GuildSetupManager.resolveCategoryName when NODE_ENV=development.
// How:   autoSetup(force:true) bypasses the early-return guard on existing
//        config. If the row in our DB is ours (just stale), autoSetup
//        updates it in place with the new channel ids. If the row is
//        foreign (shared cluster), autoSetup will hit the duplicate-key
//        guard on its insert path and bail loudly without overwriting.
//        Either branch keeps prod state safe.
async function rebuildHomebase(guild: TextChannel["guild"], guildId: string): Promise<void> {
	try {
		console.warn(LOG_MESSAGES.schedule.rebuildingHomebase(guildId));
		await GuildSetupManager.autoSetup(guild, { guildId, ownerId: guild.ownerId }, { force: true });
	} catch (error) {
		console.error(LOG_MESSAGES.schedule.rebuildHomebaseFailed(guildId), error);
	}
}
