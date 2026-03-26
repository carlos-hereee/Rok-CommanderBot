import PlayerActivityModel from "@db/models/PlayerActivity.js";
import { IPlayerActivity } from "@features/activity-tracking/activity.types";

interface IUpsertActivity {
    eventId: string;
    eventOccurrence: Date;
    userId: string;
    username: string;
    data: Partial<Omit<IPlayerActivity, "eventId" | "eventOccurrence" | "userId" | "username">>;
}

export const activityStore = {

    // core method — creates record if it doesn't exist, updates if it does
    // this is called from multiple places so upsert is safer than create
    async upsert({ eventId, eventOccurrence, userId, username, data }: IUpsertActivity) {
        return PlayerActivityModel.findOneAndUpdate(
            // ← the unique key: one record per player per occurrence
            { eventId, eventOccurrence, userId },
            {
                // only set username and eventId on first insert
                $setOnInsert: { eventId, eventOccurrence, userId, username },
                // merge in whatever activity data changed
                $set: data,
            },
            // new: true returns the updated doc
            // upsert: true creates it if it doesn't exist
            { new: true, upsert: true }
        );
    },

    // used by leaderboard route for specific occurrence view
    async findByEventAndOccurrence(eventId: string, eventOccurrence: Date) {
        return PlayerActivityModel
            .find({ eventId, eventOccurrence })
            .sort({ participationScore: -1 });
    },

    // used by players route for global ranking across all events
    async findAllGroupedByPlayer() {
        return PlayerActivityModel.aggregate([
            {
                $group: {
                    _id: "$userId",
                    username: { $last: "$username" },
                    totalScore: { $sum: "$participationScore" },
                    eventsAttended: { $sum: 1 },
                    totalVoiceMinutes: { $sum: "$voiceMinutes" },
                    totalAcknowledged: { $sum: { $cond: ["$acknowledgedReminder", 1, 0] } },
                }
            },
            { $sort: { totalScore: -1 } }
        ]);
    },

    // used by leaderboard command
    async findByEvent(eventId: string) {
        return PlayerActivityModel.find({ eventId }).sort({ participationScore: -1 });
    },

    // used to get one player's history across all events
    async findByUser(userId: string) {
        return PlayerActivityModel.find({ userId }).sort({ eventOccurrence: -1 });
    },

    // used to get one specific record — e.g. to update voiceMinutes
    async findOne(eventId: string, eventOccurrence: Date, userId: string) {
        return PlayerActivityModel.findOne({ eventId, eventOccurrence, userId });
    },
};