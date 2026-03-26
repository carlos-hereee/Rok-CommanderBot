import { ChatInputCommandInteraction } from "discord.js";
import { BOT_CONSTANTS } from "@base/constants/BOT_CONSTANTS.js";
import { TCreateEventInput } from "./event.types.js";
import { eventStore } from "@db/stores/eventStore.js";
import { v4 } from "uuid";

interface CreateEventInput {
    name: string;
    intervalHours: number;
    firstOccurrence: string;
    description?: string;
    channelId: string;
    prepSteps: { label: string; order: number }[];
}

export class GuildEventManager {
    static async createEvent(
        interaction: ChatInputCommandInteraction,
        input: CreateEventInput
    ): Promise<void> {

        // ① validate before touching the DB
        const parsedDate = new Date(input.firstOccurrence);
        if (isNaN(parsedDate.getTime())) {
            await interaction.reply({
                content: "Invalid date format. Use ISO 8601 e.g. 2024-01-01T20:00:00Z",
                ephemeral: true,
            });
            return;
        }

        if (input.intervalHours <= 0) {
            await interaction.reply({
                content: "Interval must be a positive number of hours.",
                ephemeral: true,
            });
            return;
        }

        // ② shape the data into what the DB expects
        const newEvent: TCreateEventInput = {
            name: input.name,
            description: input.description ?? "",
            intervalHours: input.intervalHours,
            firstOccurrence: parsedDate,
            reminderOffsets: [...BOT_CONSTANTS.DEFAULT_REMINDER_OFFSETS],
            channelId: input.channelId,
            guildId: interaction.guildId!,       //, comes from Discord
            prepSteps: input.prepSteps.map(step => ({ ...step, id: v4(), })),
            active: true,
        };
        // ③ delegate the actual write to the store
        const created = await eventStore.create(newEvent);

        // ④ respond to the interaction
        await interaction.reply({
            content: `✅ Event **${created.name}** created! First occurrence: <t:${Math.floor(parsedDate.getTime() / 1000)}:F>`,
            ephemeral: true,
        });
    }
}