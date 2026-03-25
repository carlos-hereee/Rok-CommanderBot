import { ChatInputCommandInteraction, GuildScheduledEventManager, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("create-ruins-reminder")
    .setDescription("Register a new recurring event");

export async function execute(interaction: ChatInputCommandInteraction) {
    await GuildScheduledEventManager.createEvent(interaction); // ← delegates to feature
}