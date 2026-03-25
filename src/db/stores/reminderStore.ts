import ReminderLogModel from "@db/models/ReminderLog.js";

// what you pass in to create a new log entry
interface ICreateReminderLog {
    eventId: string;
    eventOccurrence: Date;
    offsetMinutes: number;
    messageId: string;
    channelId: string;
    firedAt: Date;
}

// what you pass in to check for duplicates
interface IExistsQuery {
    eventId: string;
    eventOccurrence: Date;
    offsetMinutes: number;
}

export const reminderStore = {

    // used by the scheduler duplicate check before firing
    async exists(query: IExistsQuery): Promise<boolean> {
        const doc = await ReminderLogModel.findOne({
            eventId: query.eventId,
            eventOccurrence: query.eventOccurrence,
            offsetMinutes: query.offsetMinutes,
        });
        return doc !== null;
    },

    // called by ReminderJob AFTER successfully posting to Discord
    async create(data: ICreateReminderLog) {
        return ReminderLogModel.create(data);
    },

    // used by ActivityTracker to look up which event a reacted message belongs to
    async findByMessageId(messageId: string) {
        return ReminderLogModel.findOne({ messageId });
    },

    // used by leaderboard/admin to see reminder history for an event
    async findByEventId(eventId: string) {
        return ReminderLogModel.find({ eventId }).sort({ firedAt: -1 });
    },

    // used to pull all logs for a specific occurrence
    // e.g. "show me everything that fired for the 8pm Ruins event"
    async findByOccurrence(eventId: string, eventOccurrence: Date) {
        return ReminderLogModel.find({ eventId, eventOccurrence });
    },
};