// src/db/stores/botLogStore.ts
import { BotLog } from "@db/models/BotLog.js";

export const botLogStore = {
	// check if an event has been logged for a guild
	async has(guildId: string, event: string): Promise<boolean> {
		return !!(await BotLog.findOne({ guildId, event }));
	},

	// log an event for a guild
	async log(guildId: string, event: string, metadata: Record<string, unknown> = {}): Promise<void> {
		await BotLog.create({ guildId, event, metadata });
	},

	// get all logs for a guild
	async getAll(guildId: string): Promise<{ event: string; metadata: unknown; createdAt: Date }[]> {
		return BotLog.find({ guildId }).sort({ createdAt: -1 }).lean();
	},

	// get all logs for a specific event across all guilds
	async getAllByEvent(event: string): Promise<{ guildId: string; metadata: unknown; createdAt: Date }[]> {
		return BotLog.find({ event }).sort({ createdAt: -1 }).lean();
	},
};
