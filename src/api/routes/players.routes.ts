import { Router, Request, Response } from "express";
import { activityStore } from "@db/stores/activityStore.js";
import { eventStore } from "@db/stores/eventStore.js";
import { requireGuildId } from "../middleware/requireGuildId.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";

export const playersRouter = Router();

type PlayersRequest = Request<
	{ userId: string }, // ← Params:      req.params.userId
	any, // ← ResBody:      what res.json() sends back
	any, // ← ReqBody:      req.body shape
	{ mode?: string; occurrence?: string; guildId?: string } // ← QueryString:  req.query shape
>;

// ── helper ────────────────────────────────────────────────────
// PlayerActivity does not store guildId directly (the model is keyed on
// eventId + eventOccurrence + userId). to scope player queries to a single
// guild we look up the guild's events first, collect their eventIds, and
// pass that set into the activityStore. this keeps the model unchanged
// while honoring the v1 multi-guild safety contract from spec section 3.
async function getEventIdsForGuild(guildId: string): Promise<string[]> {
	const events = await eventStore.findByGuildId(guildId);
	return events.map((e) => e.eventId);
}

// GET /api/players?guildId=... — all players ranked by total score across
// the requesting guild's events only
playersRouter.get("/", async (req: PlayersRequest, res: Response) => {
	const guildId = requireGuildId(req, res);
	if (guildId === null) return;
	try {
		const eventIds = await getEventIdsForGuild(guildId);
		const records = await activityStore.findAllGroupedByPlayerInEvents(eventIds);
		res.json({ data: records });
	} catch (error) {
		console.log(LOG_MESSAGES.api.errorFindingPlayers, error, LOG_MESSAGES.api.errorSuffix);
		res.status(500).json({ error: "Failed to fetch players" });
	}
});

// GET /api/players/:userId?guildId=... — full activity history for one
// player, scoped to the requesting guild's events
playersRouter.get("/:userId", async (req: PlayersRequest, res: Response) => {
	const guildId = requireGuildId(req, res);
	if (guildId === null) return;
	try {
		const eventIds = await getEventIdsForGuild(guildId);
		const records = await activityStore.findByUserInEvents(req.params.userId, eventIds);
		if (!records.length) {
			res.status(404).json({ error: "No activity found for this player" });
			return;
		}
		res.json({ data: records });
	} catch (error) {
		console.log(LOG_MESSAGES.api.errorFindingPlayerActivity, error, LOG_MESSAGES.api.errorSuffix);
		res.status(500).json({ error: "Failed to fetch player activity" });
	}
});
