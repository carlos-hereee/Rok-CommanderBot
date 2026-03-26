import { Router, Request, Response } from "express";
import { activityStore } from "@db/stores/activityStore.js";

export const playersRouter = Router();

type PlayersRequest = Request<
	{ userId: string }, // ← Params:      req.params.eventId
	any, // ← ResBody:      what res.json() sends back
	any, // ← ReqBody:      req.body shape
	{ mode?: string; occurrence?: string } // ← QueryString:  req.query shape
>;

// GET /api/players/:userId — full activity history for one player
playersRouter.get("/:userId", async (req: PlayersRequest, res: Response) => {
	try {
		const records = await activityStore.findByUser(req.params.userId);
		if (!records.length) {
			res.status(404).json({ error: "No activity found for this player" });
			return;
		}
		res.json({ data: records });
	} catch (error) {
		console.log("\n\nerror occurred finding player activity ==>", error, "\n\n");
		res.status(500).json({ error: "Failed to fetch player activity" });
	}
});

// GET /api/players — all players ranked by total score across all events
playersRouter.get("/", async (req: PlayersRequest, res: Response) => {
	try {
		const records = await activityStore.findAllGroupedByPlayer();
		res.json({ data: records });
	} catch (error) {
		console.log("\n\nerror occurred finding players ==>", error, "\n\n");
		res.status(500).json({ error: "Failed to fetch players" });
	}
});
