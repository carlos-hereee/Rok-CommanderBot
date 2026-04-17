import { Router, Request, Response } from "express";
import { Client } from "discord.js";
import { eventStore } from "@db/stores/eventStore.js";
import { fireTestReminder } from "@features/reminders/TestReminderJob.js";
import { BOT_CONSTANTS } from "@base/constants/BOT_CONSTANTS.js";
import { requireGuildId } from "../middleware/requireGuildId.js";
import { refreshSchedule } from "@features/schedule/ScheduleBoard.js";

// fire and forget helper. the schedule board refresh is a Discord API call
// that should never block the HTTP response. errors are logged; on the
// next successful mutation or the hourly tick the board converges.
function kickScheduleRefresh(client: Client, guildId: string, trigger: string): void {
	refreshSchedule(client, guildId).catch((err) => console.error(`[schedule] refresh after ${trigger} failed:`, err));
}

// ── rate limiter for POST /:eventId/test-reminder ─────────────
// in-memory map keyed by `${guildId}:${eventId}` -> last fire timestamp (ms).
// resets on bot restart, which is acceptable for a test fire feature.
// lives at module scope so the limiter is shared across all requests.
const testReminderLastFiredAt = new Map<string, number>();

type EventsRequest = Request<
	{ eventId: string }, // ← Params:      req.params.eventId
	any, // ← ResBody:      what res.json() sends back
	any, // ← ReqBody:      req.body shape
	{ mode?: string; occurrence?: string; guildId?: string } // ← QueryString:  req.query shape
>;

// factory: the Discord client is a dependency because POST /:eventId/test-reminder
// needs to post to a channel. the rest of the routes do not use it.
export function createEventsRouter(client: Client): Router {
	const eventsRouter = Router();

	// GET /api/events?guildId=... — list all active events for one guild
	eventsRouter.get("/", async (req: EventsRequest, res: Response) => {
		const guildId = requireGuildId(req, res);
		if (guildId === null) return;
		try {
			const events = await eventStore.findByGuildId(guildId);
			res.json({ data: events });
		} catch (error) {
			console.log("\n\nerror occurred finding events ==>", error, "\n\n");
			res.status(500).json({ error: "Failed to fetch events" });
		}
	});

	// GET /api/events/:eventId?guildId=... — get one event, scoped to guild
	eventsRouter.get("/:eventId", async (req: EventsRequest, res: Response) => {
		const guildId = requireGuildId(req, res);
		if (guildId === null) return;
		try {
			const event = await eventStore.findById(req.params.eventId);
			if (!event || event.guildId !== guildId) {
				res.status(404).json({ error: "Event not found" });
				return;
			}
			res.json({ data: event });
		} catch (error) {
			console.log("\n\nerror occurred finding event ==>", error, "\n\n");
			res.status(500).json({ error: "Failed to fetch event" });
		}
	});

	// POST /api/events?guildId=... — create a new event. body.guildId must
	// match the query guildId. if the body omits guildId, we inject it from
	// the query so the dashboard can post a slimmer payload.
	eventsRouter.post("/", async (req: EventsRequest, res: Response) => {
		const guildId = requireGuildId(req, res);
		if (guildId === null) return;
		try {
			const body = { ...(req.body ?? {}) };
			if (body.guildId && body.guildId !== guildId) {
				res.status(400).json({
					error: "Body guildId does not match query guildId",
					detail: "These must match or the body guildId must be omitted.",
				});
				return;
			}
			body.guildId = guildId;
			// defensive strip: the Event schema has no channelId field and
			// mongoose strict mode would silently drop it anyway, but we
			// remove it here too so an older dashboard build sending the old
			// shape does not get a confusing silent success. the single source
			// of truth for where a reminder posts is guildConfig.announcementsChannelId.
			delete body.channelId;
			const event = await eventStore.create(body);
			res.status(201).json({ data: event });
			kickScheduleRefresh(client, guildId, "POST /api/events");
		} catch (error) {
			console.log("\n\nerror occurred creating event ==>", error, "\n\n");
			res.status(500).json({ error: "Failed to create event" });
		}
	});

	// PATCH /api/events/:eventId?guildId=... — update an event the guild owns
	eventsRouter.patch("/:eventId", async (req: EventsRequest, res: Response) => {
		const guildId = requireGuildId(req, res);
		if (guildId === null) return;
		try {
			const existing = await eventStore.findById(req.params.eventId);
			if (!existing || existing.guildId !== guildId) {
				res.status(404).json({ error: "Event not found" });
				return;
			}
			// disallow moving an event between guilds via PATCH. if the body
			// contains guildId it must match, otherwise we strip it out.
			const body = { ...(req.body ?? {}) };
			if (body.guildId && body.guildId !== guildId) {
				res.status(400).json({ error: "Cannot change guildId via PATCH" });
				return;
			}
			delete body.guildId;
			const updated = await eventStore.update(req.params.eventId, body);
			res.json({ data: updated });
			kickScheduleRefresh(client, guildId, "PATCH /api/events/:eventId");
		} catch (error) {
			console.log("\n\nerror occurred updating event ==>", error, "\n\n");
			res.status(500).json({ error: "Failed to update event" });
		}
	});

	// DELETE /api/events/:eventId?guildId=... — soft delete an event the guild owns
	eventsRouter.delete("/:eventId", async (req: EventsRequest, res: Response) => {
		const guildId = requireGuildId(req, res);
		if (guildId === null) return;
		try {
			const existing = await eventStore.findById(req.params.eventId);
			if (!existing || existing.guildId !== guildId) {
				res.status(404).json({ error: "Event not found" });
				return;
			}
			await eventStore.delete(req.params.eventId);
			res.json({ message: "Event deactivated" });
			kickScheduleRefresh(client, guildId, "DELETE /api/events/:eventId");
		} catch (error) {
			console.log("\n\nerror occurred deleting event ==>", error, "\n\n");
			res.status(500).json({ error: "Failed to delete event" });
		}
	});

	// ── POST /api/events/:eventId/test-reminder?guildId=... ────────
	// fires a TEST reminder embed to the event's configured channel.
	// this is the only route on eventsRouter that depends on the Discord client.
	// see features/reminders/TestReminderJob.ts for the invariants this route upholds.
	eventsRouter.post("/:eventId/test-reminder", async (req: EventsRequest, res: Response) => {
		const guildId = requireGuildId(req, res);
		if (guildId === null) return;
		try {
			// ① look up the event. 404 if missing, soft-deleted, or owned by
			// a different guild. returning 404 (not 403) for the wrong-guild
			// case is deliberate: do not leak the existence of events belonging
			// to other guilds.
			const event = await eventStore.findById(req.params.eventId);
			if (!event || event.guildId !== guildId) {
				res.status(404).json({ error: "Event not found" });
				return;
			}

			// ② enforce the per-event cooldown. keyed on guildId + eventId so
			// two different guilds testing two different events never block each
			// other, and two different events in the same guild never block each
			// other. this is the only client-visible rate limit.
			const key = `${event.guildId}:${event.eventId}`;
			const now = Date.now();
			const last = testReminderLastFiredAt.get(key);
			if (last && now - last < BOT_CONSTANTS.TEST_REMINDER_COOLDOWN_MS) {
				const retryAfterMs = BOT_CONSTANTS.TEST_REMINDER_COOLDOWN_MS - (now - last);
				res.status(429).json({
					error: "Test reminder cooldown in effect",
					retryAfterMs,
					retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
				});
				return;
			}

			// ③ dispatch the fire. fireTestReminder is responsible for the
			// [TEST] prefix, skipping the dedup guard via the sentinel offset,
			// and never writing to PlayerActivity.
			const result = await fireTestReminder(client, event);

			if (!result.ok) {
				// map the known reasons to readable 409s so the dashboard can
				// surface them through LogMessages. the explicit union keeps the
				// record exhaustive: adding a new reason to TestReminderJob
				// without updating this mapping is a compile time error.
				const detailByReason: Record<
					"guild_not_configured" | "channel_not_found" | "channel_wrong_type" | "post_failed",
					string
				> = {
					guild_not_configured: "This guild has not finished /setup yet. Run /setup in Discord first.",
					channel_not_found: "The herald cannot reach that channel. Verify bot permissions in Discord.",
					channel_wrong_type: "The configured channel is not a text channel.",
					post_failed: "The decree could not be delivered to the channel.",
				};
				res.status(409).json({
					error: detailByReason[result.reason],
					reason: result.reason,
					detail: result.detail,
				});
				return;
			}

			// ④ record the successful fire for the cooldown tracker only AFTER
			// the post succeeds. failed posts do not count against the cooldown.
			testReminderLastFiredAt.set(key, now);

			res.json({
				data: {
					ok: true,
					messageId: result.messageId,
					channelId: result.channelId,
					firedAt: result.firedAt,
					cooldownMs: BOT_CONSTANTS.TEST_REMINDER_COOLDOWN_MS,
				},
			});
		} catch (error) {
			console.log("\n\nerror occurred firing test reminder ==>", error, "\n\n");
			res.status(500).json({ error: "Failed to fire test reminder" });
		}
	});

	return eventsRouter;
}
