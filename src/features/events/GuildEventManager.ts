import { ChatInputCommandInteraction } from "discord.js";
import { eventStore } from "@db/stores/eventStore.js";
import { BOT_CONSTANTS } from "@base/constants/BOT_CONSTANTS.js";
import { IGameEvent } from "./event.types.js";

interface CreateEventInput {
    name: string;
    intervalHours: number;
    firstOccurrence: string;
    channelId: string;
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
        const newEvent: Omit<IGameEvent, "id"> = {
            name: input.name,
            intervalHours: input.intervalHours,
            firstOccurrence: parsedDate,
            reminderOffsets: BOT_CONSTANTS.DEFAULT_REMINDER_OFFSETS, // [30, 15]
            channelId: input.channelId,
            prepSteps: BOT_CONSTANTS.DEFAULT_PREP_STEPS,
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