import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { GuildEventManager } from "../../features/events/GuildEventManager.js";

export const data = new SlashCommandBuilder()
    .setName("create-event")
    .setDescription("Register a new recurring event")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
        option.setName("name")
            .setDescription("Event name e.g. Ruins")
            .setRequired(true))
    .addNumberOption(option =>
        option.setName("interval")
            .setDescription("How many hours between occurrences e.g. 36")
            .setRequired(true))
    .addStringOption(option =>
        option.setName("first-occurrence")
            .setDescription("When the first event starts e.g. 2024-01-01T20:00:00Z")
            .setRequired(true))
    .addStringOption(option =>
        option.setName("channel")
            .setDescription("Channel ID to post reminders in")
            .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    // extract the raw values from Discord
    const name = interaction.options.getString("name", true);
    const intervalHours = interaction.options.getNumber("interval", true);
    const firstOccurrence = interaction.options.getString("first-occurrence", true);
    const channelId = interaction.options.getString("channel", true);

    // hand off immediately — this file's only job is to receive and forward
    await GuildEventManager.createEvent(interaction, {
        name,
        intervalHours,
        firstOccurrence,
        channelId,
    });
}