import { Router, Request, Response } from "express";
import { eventStore } from "@db/stores/eventStore.js";
// import { GuildEventManager } from "@features/events/GuildEventManager.js";

export const eventsRouter = Router();

type EventsRequest = Request<
	{ eventId: string }, // ← Params:      req.params.eventId
	any, // ← ResBody:      what res.json() sends back
	any, // ← ReqBody:      req.body shape
	{ mode?: string; occurrence?: string } // ← QueryString:  req.query shape
>;

// GET /api/events — list all active events
eventsRouter.get("/", async (req: EventsRequest, res: Response) => {
	try {
		const events = await eventStore.findAll();
		res.json({ data: events });
	} catch (error) {
		console.log("\n\nerror occurred finding events ==>", error, "\n\n");
		res.status(500).json({ error: "Failed to fetch events" });
	}
});

// GET /api/events/:eventId — get one event
eventsRouter.get("/:eventId", async (req: EventsRequest, res: Response) => {
	try {
		const event = await eventStore.findById(req.params.eventId);
		if (!event) {
			res.status(404).json({ error: "Event not found" });
			return;
		}
		res.json({ data: event });
	} catch (error) {
		console.log("\n\nerror occurred finding event ==>", error, "\n\n");
		res.status(500).json({ error: "Failed to fetch event" });
	}
});

// POST /api/events — create a new event
eventsRouter.post("/", async (req: EventsRequest, res: Response) => {
	try {
		const event = await eventStore.create(req.body);
		res.status(201).json({ data: event });
	} catch (error) {
		console.log("\n\nerror occurred creating event ==>", error, "\n\n");
		res.status(500).json({ error: "Failed to create event" });
	}
});

// PATCH /api/events/:eventId — update an event
eventsRouter.patch("/:eventId", async (req: EventsRequest, res: Response) => {
	try {
		const updated = await eventStore.update(req.params.eventId, req.body);
		if (!updated) {
			res.status(404).json({ error: "Event not found" });
			return;
		}
		res.json({ data: updated });
	} catch (error) {
		console.log("\n\nerror occurred updating event ==>", error, "\n\n");
		res.status(500).json({ error: "Failed to update event" });
	}
});

// DELETE /api/events/:eventId — soft delete an event
eventsRouter.delete("/:eventId", async (req: EventsRequest, res: Response) => {
	try {
		await eventStore.delete(req.params.eventId);
		res.json({ message: "Event deactivated" });
	} catch (error) {
		console.log("\n\nerror occurred deleting event ==>", error, "\n\n");
		res.status(500).json({ error: "Failed to delete event" });
	}
});
