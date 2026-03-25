// features/events/EventManager.ts

import { ChatInputCommandInteraction } from "discord.js";

// rename to GuildEventManager, RuinsEventManager, or something domain-specific
export class GuildEventManager {
    static async createEvent(interaction: ChatInputCommandInteraction) {
        // your logic
    }
}