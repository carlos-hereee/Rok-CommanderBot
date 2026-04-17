import mongoose from "mongoose";
import { v4 } from "uuid";

const Schema = mongoose.Schema;

// sub-schema for prep steps with metadata
const prepStepSchema = new Schema({
	id: { type: String, required: true, default: v4 },
	label: { type: String, required: true }, // e.g. "Activate stats token"
	order: { type: Number, required: true }, // display order in the reminder embed
});

const eventSchema = new Schema(
	{
		eventId: { type: String, required: true, unique: true, default: v4 },
		name: { type: String, required: true }, // e.g. "Ruins"
		description: { type: String, default: "" },
		type: { type: String, required: true, enum: ["recurring", "one-time"] },
		intervalHours: { type: Number, required: true }, // e.g. 36 or 84
		firstOccurrence: { type: Date, required: true }, // anchor point for schedule calculation
		seasonEnd: { type: Date, required: true },
		reminderOffsets: { type: [Number], default: [30, 15] }, // minutes before event
		// per-event channel override — optional. when null/absent, the reminder
		// falls back to guildConfig.announcementsChannelId at fire time. this
		// is why event creation no longer prompts for a channel: the home base
		// announcement channel is the source of truth unless an admin explicitly
		// overrides it for one specific event.
		channelId: { type: String, required: false, default: null },
		guildId: { type: String, required: true }, // Discord server ID
		prepSteps: { type: [prepStepSchema], default: [] },
		active: { type: Boolean, default: true }, // soft delete flag
	},
	{ timestamps: true } // adds createdAt + updatedAt automatically
);

const EventModel = mongoose.model("Event", eventSchema);
export default EventModel;
