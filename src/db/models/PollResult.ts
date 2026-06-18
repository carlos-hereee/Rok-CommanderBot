import mongoose from "mongoose";
import { v4 } from "uuid";

const Schema = mongoose.Schema;

// ── PollResult ─────────────────────────────────────────────────────────
// One row per (poll, guild, user) capturing a member's vote in an audience
// poll broadcast by PollDispatcher (v1.6 Phase 3, item 34a). Written by the
// poll vote button handler; read as a cross-guild aggregate by the platform
// owner. Re-voting upserts the same row (choice changes, no duplicate), which
// is how dedup and change-vote are both handled with a single unique key.
const pollResultSchema = new Schema(
	{
		resultId: { type: String, required: true, unique: true, default: v4 },
		pollId: { type: String, required: true }, // stable id from pollDefinitions
		guildId: { type: String, required: true }, // guild the vote came from
		userId: { type: String, required: true }, // Discord user id of the voter
		choice: { type: String, required: true }, // option key the user selected
	},
	{ timestamps: true }
);

// one vote per user per poll per guild. recordVote upserts on this key so a
// member changing their mind updates the row instead of adding a second vote.
pollResultSchema.index({ pollId: 1, guildId: 1, userId: 1 }, { unique: true });

const PollResultModel = mongoose.model("PollResult", pollResultSchema);
export default PollResultModel;
