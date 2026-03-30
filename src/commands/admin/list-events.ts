import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { eventStore } from "@db/stores/eventStore.js";
import { listEventsEmbed } from "@utils/embedBuilder.js";
import { embedContent } from "@base/constants/embed-content.js";
import { getUpcomingOccurrences } from "@features/events/occurrenceCalculator.js";

export const data = new SlashCommandBuilder()
	.setName("list-events")
	.setDescription("List all active KvK events configured for this server");

export async function execute(interaction: ChatInputCommandInteraction) {
	const events = await eventStore.findByGuildId(interaction.guildId!);

	if (!events.length) {
		await interaction.reply({
			content: embedContent.listEvents.noEvents,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const fields = events.map((event) => {
		let nextOccurrenceTs: number;

		if (event.type === "one-time") {
			// use firstOccurrence directly — no interval math needed
			nextOccurrenceTs = Math.floor(new Date(event.firstOccurrence).getTime() / 1000);
		} else {
			const [next] = getUpcomingOccurrences(event as any, 1);
			// fall back to firstOccurrence if season ended and no future occurrence exists
			nextOccurrenceTs = Math.floor((next ?? new Date(event.firstOccurrence)).getTime() / 1000);
		}

		return {
			name: event.name,
			type: event.type as "recurring" | "one-time",
			nextOccurrenceTs,
			intervalHours: event.type === "recurring" ? event.intervalHours : null,
			seasonEndTs: Math.floor(new Date(event.seasonEnd).getTime() / 1000),
			channelId: event.channelId,
		};
	});

	await interaction.reply({
		embeds: [listEventsEmbed(fields)],
		flags: MessageFlags.Ephemeral,
	});
}
