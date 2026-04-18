import { Router, Request, Response } from "express";
import { reminderStore } from "@db/stores/reminderStore.js";
import { eventStore } from "@db/stores/eventStore.js";
import { requireGuildId } from "../middleware/requireGuildId.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";

export const remindersRouter = Router();

type RemindersRequest = Request<
	{ eventId: string }, // ← Params:      req.params.eventId
	any, // ← ResBody:      what res.json() sends back
	any, // ← ReqBody:      req.body shape
	{ mode?: string; occurrence?: string; guildId?: string } // ← QueryString:  req.query shape
>;

// GET /api/reminders/:eventId?guildId=... — reminder history for an event
// the event must belong to the requesting guild or we 404.
remindersRouter.get("/:eventId", async (req: RemindersRequest, res: Response) => {
	const guildId = requireGuildId(req, res);
	if (guildId === null) return;
	try {
		const event = await eventStore.findById(req.params.eventId);
		// 404 (not 403) for wrong-guild is deliberate: do not leak the
		// existence of events belonging to other guilds.
		if (!event || event.guildId !== guildId) {
			res.status(404).json({ error: "Event not found" });
			return;
		}
		const logs = await reminderStore.findByEventId(req.params.eventId);
		res.json({ data: logs });
	} catch (error) {
		console.log(LOG_MESSAGES.api.errorFindingReminders, error, LOG_MESSAGES.api.errorSuffix);
		res.status(500).json({ error: "Failed to fetch reminders" });
	}
});
