import { Router, Request, Response } from "express";
import { activityStore } from "@db/stores/activityStore.js";
import { eventStore } from "@db/stores/eventStore.js";

export const leaderboardRouter = Router();

type LeaderboardRequest = Request<
	{ eventId: string }, // ← Params:      req.params.eventId
	any, // ← ResBody:      what res.json() sends back
	any, // ← ReqBody:      req.body shape
	{ mode?: string; occurrence?: string } // ← QueryString:  req.query shape
>;

// GET /api/leaderboard/:eventId?mode=alltime|occurrence&occurrence=ISO_DATE
// mode=alltime    → cumulative scores across all occurrences
// mode=occurrence → scores for one specific occurrence
leaderboardRouter.get("/:eventId", async (req: LeaderboardRequest, res: Response) => {
	try {
		const { eventId } = req.params;
		const mode = (req.query.mode as string) ?? "alltime";
		const occurrence = req.query.occurrence as string;

		const event = await eventStore.findById(eventId);
		if (!event) {
			res.status(404).json({ error: "Event not found" });
			return;
		}

		let records;

		if (mode === "occurrence" && occurrence) {
			// scores for one specific occurrence
			records = await activityStore.findByEventAndOccurrence(eventId, new Date(occurrence));
		} else {
			// all time — fetch all records and aggregate per player
			const all = await activityStore.findByEvent(eventId);

			// group by userId and sum their scores
			const playerMap = new Map<
				string,
				{
					userId: string;
					username: string;
					totalScore: number;
					eventsAttended: number;
					totalVoiceMinutes: number;
					totalAcknowledged: number;
				}
			>();

			for (const record of all) {
				const existing = playerMap.get(record.userId);
				if (existing) {
					existing.totalScore += record.participationScore;
					existing.eventsAttended += 1;
					existing.totalVoiceMinutes += record.voiceMinutes;
					existing.totalAcknowledged += record.acknowledgedReminder ? 1 : 0;
				} else {
					playerMap.set(record.userId, {
						userId: record.userId,
						username: record.username,
						totalScore: record.participationScore,
						eventsAttended: 1,
						totalVoiceMinutes: record.voiceMinutes,
						totalAcknowledged: record.acknowledgedReminder ? 1 : 0,
					});
				}
			}

			// sort by total score descending
			records = Array.from(playerMap.values()).sort((a, b) => b.totalScore - a.totalScore);
		}

		res.json({
			data: { event: { eventId: event.eventId, name: event.name }, mode, records },
		});
	} catch (error) {
		console.log("\n\nerror occurred finding leaderboard ==>", error, "\n\n");
		res.status(500).json({ error: "Failed to fetch leaderboard" });
	}
});
