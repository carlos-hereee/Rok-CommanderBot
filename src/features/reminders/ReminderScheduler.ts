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
import { getOutboundLatencyStats } from "@utils/serverApi.js";
import { noteFailure as noteServerFailure, noteSuccess as noteServerSuccess } from "./serverHealthNotifier.js";

// ── F5 observability: fire-rate counters ──
// What: in-process counters tracking successful and failed reminder fires per hour.
//   Logged on the hourly tick alongside outbound HTTP latency stats so Railway logs
//   surface the platform's health at a glance.
// Who: incremented by the scheduler's per-event branches (one-time + recurring).
//   Read by logHourlyMetrics() below.
// When: reset every hour after the log line — a rolling window means a transient
//   spike doesn't hide behind a wall of healthy historical data.
// Where: per-process counters; multi-instance deployments would need to ship to
//   a central metrics store. Single Railway dyno keeps it simple.
let fireSuccessCount = 0;
let fireFailureCount = 0;

const recordFireSuccess = (): void => {
	fireSuccessCount++;
};
const recordFireFailure = (): void => {
	fireFailureCount++;
};

// ── logHourlyMetrics ──
// Emits a single structured log line per hour with everything operators need to
// catch slow drift before it becomes an outage:
//   - bot→server HTTP latency p50/p95/p99 (cron tick budget is 60s; alert if p99 > 500ms)
//   - reminder fire success/failure counts and rate
const logHourlyMetrics = (): void => {
	const latency = getOutboundLatencyStats();
	const total = fireSuccessCount + fireFailureCount;
	const failureRate = total === 0 ? 0 : fireFailureCount / total;
	console.log(
		`[metrics] outbound_p50=${latency.p50}ms outbound_p95=${latency.p95}ms outbound_p99=${latency.p99}ms ` +
			`outbound_samples=${latency.samples} fires_ok=${fireSuccessCount} fires_failed=${fireFailureCount} ` +
			`failure_rate=${failureRate.toFixed(3)}`
	);
	// Alert thresholds. These are warns (not errors) so a single bad hour does not
	// page anyone, but they ARE louder than info so a log scan catches them. The
	// roadmap (F5) calls out "alert if failure rate > 1% over a 1-hour window" —
	// that's the threshold here.
	if (latency.p99 > 500 && latency.samples >= 10) {
		console.warn(
			`[metrics] outbound_p99 ${latency.p99}ms exceeds 500ms threshold — cron tick may overrun its 60s budget`
		);
	}
	if (failureRate > 0.01 && total >= 10) {
		console.warn(
			`[metrics] reminder failure rate ${(failureRate * 100).toFixed(1)}% exceeds 1% threshold over the last hour`
		);
	}
	// Reset counters for the next window.
	fireSuccessCount = 0;
	fireFailureCount = 0;
};

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
		// Emit hourly metrics line right after the schedule sweep so a single
		// log timestamp captures both. The metrics function never throws.
		logHourlyMetrics();
	});

	cron.schedule(BOT_CONSTANTS.SCHEDULER_CRON, async () => {
		try {
			// ① Fetch all active events for every guild this bot is in.
			//
			// Why we iterate guilds instead of calling eventStore.findAll():
			//   The Future-A remote API (USE_REMOTE_EVENTS=true) requires a guildId
			//   on every read so the platform server can apply HMAC verification AND
			//   confirm the guild belongs to an installed app. A global-scan endpoint
			//   would expose every guild's events in one signed call, which we do not
			//   want. Iterating client.guilds.cache and calling findByGuildId per
			//   guild keeps the scope tight in both modes; the local-DB mode is just
			//   as fast since the index on { guildId, active } is the same shape.
			//
			// Cache reuse: remoteEventStore caches list reads for 60s keyed by guildId.
			// The scheduler runs every minute so we hit the cache exactly when we want
			// (every other tick), saving the HTTP call on the cold path while still
			// surfacing fresh data within one tick of any write.
			const guildIds = Array.from(client.guilds.cache.keys());
			// Track whether any guild succeeded so we can call noteServerSuccess
			// at most once per tick — each individual guild call doesn't trigger
			// the recovery DM, only "tick had at least one success" does.
			let anySuccess = false;
			let anyUnreachable = false;
			const eventsByGuild = await Promise.all(
				guildIds.map(async (guildId) => {
					try {
						const e = await eventStore.findByGuildId(guildId);
						anySuccess = true;
						return e;
					} catch (err) {
						// One guild's failure should not block the rest. The remote API
						// will eventually return; the next tick will catch up. Logging
						// at warn (not error) because brief Heroku blips are routine.
						console.warn(LOG_MESSAGES.api.errorFindingEvents, { guildId, err });
						// Notify health tracker — only ServerUnreachableError counts
						// as a platform outage; other errors (validation, auth) don't.
						noteServerFailure(client, err);
						anyUnreachable = true;
						return [] as IGameEvent[];
					}
				})
			);
			// Drive the success/failure tracker once per tick instead of once
			// per guild so a partial outage doesn't toggle state on every guild.
			if (anySuccess) noteServerSuccess(client);
			else if (anyUnreachable) {
				// All guilds failed AND at least one was a server-unreachable error.
				// noteFailure was already called per-guild; nothing to do here.
			}
			const events: IGameEvent[] = eventsByGuild.flat() as IGameEvent[];

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
					await eventStore.updateInGuild(event.eventId, event.guildId, { paused: false, pausedUntil: null });
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
					// Soft-delete, not a generic update: under remote mode the server's PATCH endpoint
// does not accept `active` in the field whitelist (the soft-delete is its own DELETE
// route). deleteInGuild routes to the right endpoint for both modes.
await eventStore.deleteInGuild(event.eventId, event.guildId);
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

						// Wrap fire in success/failure metrics. fireReminder swallows its own
						// Discord errors (channel missing, permission denied), so we only see
						// throws on truly unexpected failures — but counting both branches
						// gives operators a real signal in the hourly metric log.
						try {
							await fireReminder(client, event, event.firstOccurrence, offsetMinutes);
							recordFireSuccess();
						} catch (err) {
							recordFireFailure();
							console.error(LOG_MESSAGES.api.errorTestReminder ?? "fireReminder failed", err);
						}

						// deactivate after the last reminder fires
						// so it doesn't keep getting checked every tick
						if (offsetMinutes === Math.min(...event.reminderOffsets)) {
							// Soft-delete, not a generic update: under remote mode the server's PATCH endpoint
// does not accept `active` in the field whitelist (the soft-delete is its own DELETE
// route). deleteInGuild routes to the right endpoint for both modes.
await eventStore.deleteInGuild(event.eventId, event.guildId);
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

						try {
							await fireReminder(client, event, nextOccurrence, offsetMinutes);
							recordFireSuccess();
						} catch (err) {
							recordFireFailure();
							console.error(LOG_MESSAGES.api.errorTestReminder ?? "fireReminder failed", err);
						}
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
