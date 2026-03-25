// db/models/PlayerActivity.ts
import mongoose from "mongoose";
import { v4 } from "uuid";

const Schema = mongoose.Schema;

const playerActivitySchema = new Schema(
    {
        activityId: { type: String, required: true, unique: true, default: v4 },
        eventId: { type: String, required: true, ref: "Event" },
        eventOccurrence: { type: Date, required: true },           // which specific occurrence
        userId: { type: String, required: true },           // Discord user ID
        username: { type: String, required: true },

        // reminder acknowledgement
        acknowledgedReminder: { type: Boolean, default: false },
        acknowledgedAt: { type: Date, default: null },

        // presence at event start
        wasOnlineAtStart: { type: Boolean, default: false },

        // voice activity during event window
        joinedVoiceDuring: { type: Boolean, default: false },
        voiceMinutes: { type: Number, default: 0 },

        // computed — recalculated whenever any field above changes
        participationScore: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// compound index — one record per player per event occurrence
playerActivitySchema.index({ eventId: 1, eventOccurrence: 1, userId: 1 }, { unique: true });

const PlayerActivityModel = mongoose.model("PlayerActivity", playerActivitySchema);
export default PlayerActivityModel;