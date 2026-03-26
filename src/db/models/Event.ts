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
		intervalHours: { type: Number, required: true }, // e.g. 36 or 84
		firstOccurrence: { type: Date, required: true }, // anchor point for schedule calculation
		reminderOffsets: { type: [Number], default: [30, 15] }, // minutes before event
		channelId: { type: String, required: true }, // Discord channel ID
		guildId: { type: String, required: true }, // Discord server ID
		prepSteps: { type: [prepStepSchema], default: [] },
		active: { type: Boolean, default: true }, // soft delete flag
	},
	{ timestamps: true } // adds createdAt + updatedAt automatically
);

const EventModel = mongoose.model("Event", eventSchema);
export default EventModel;
