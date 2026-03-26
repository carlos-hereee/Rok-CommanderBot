import { Router, Request, Response } from "express";
import { reminderStore } from "@db/stores/reminderStore.js";

export const remindersRouter = Router();

type RemindersRequest = Request<
    { eventId: string },                      // ← Params:      req.params.eventId
    any,                                      // ← ResBody:      what res.json() sends back
    any,                                      // ← ReqBody:      req.body shape
    { mode?: string; occurrence?: string; }   // ← QueryString:  req.query shape
>;

// GET /api/reminders/:eventId — reminder history for an event
remindersRouter.get("/:eventId", async (req: RemindersRequest, res: Response) => {
    try {
        const logs = await reminderStore.findByEventId(req.params.eventId);
        res.json({ data: logs });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch reminders" });
    }
});