// db/models/ReminderLog.ts
import mongoose from "mongoose";
import { v4 } from "uuid";

const Schema = mongoose.Schema;

const reminderLogSchema = new Schema(
    {
        logId: { type: String, required: true, unique: true, default: v4 },
        eventId: { type: String, required: true, ref: "Event" },
        eventOccurrence: { type: Date, required: true },              // which occurrence this reminder was for
        offsetMinutes: { type: Number, required: true },              // was this the 30min or 15min reminder
        messageId: { type: String, required: true },              // Discord message ID for reaction tracking
        channelId: { type: String, required: true },
        firedAt: { type: Date, required: true },
    },
    { timestamps: true }
);

// compound index — prevents duplicate reminders firing for the same event+occurrence+offset
reminderLogSchema.index({ eventId: 1, eventOccurrence: 1, offsetMinutes: 1 }, { unique: true });

const ReminderLogModel = mongoose.model("ReminderLog", reminderLogSchema);
export default ReminderLogModel;