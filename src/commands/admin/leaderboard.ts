import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from "discord.js";
import { activityStore } from "@db/stores/activityStore.js";
import { eventStore } from "@db/stores/eventStore.js";
import { leaderboardEmbed } from "@utils/embedBuilder.js";

export const data = new SlashCommandBuilder()
	.setName("leaderboard")
	.setDescription("Show the participation leaderboard for a ROK event")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addStringOption((option) => option.setName("event-id").setDescription("The event ID to show rankings for").setRequired(true))
	.addBooleanOption((option) =>
		option.setName("public").setDescription("Post publicly in channel? Default: only you can see it").setRequired(false)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	const eventId = interaction.options.getString("event-id", true);
	const isPublic = interaction.options.getBoolean("public") ?? false;

	const event = await eventStore.findById(eventId);
	if (!event) {
		await interaction.reply({ content: "❌ Event not found.", ephemeral: true });
		return;
	}

	// aggregate all time scores for this event
	const allRecords = await activityStore.findByEvent(eventId);
	if (!allRecords.length) {
		await interaction.reply({ content: "No activity recorded for this event yet.", ephemeral: true });
		return;
	}

	// group and sum scores per player
	const playerMap = new Map<
		string,
		{ username: string; totalScore: number; eventsAttended: number; totalAcknowledged: number }
	>();

	for (const record of allRecords) {
		const existing = playerMap.get(record.userId);
		if (existing) {
			existing.totalScore += record.participationScore;
			existing.eventsAttended += 1;
			existing.totalAcknowledged += record.acknowledgedReminder ? 1 : 0;
		} else {
			playerMap.set(record.userId, {
				username: record.username,
				totalScore: record.participationScore,
				eventsAttended: 1,
				totalAcknowledged: record.acknowledgedReminder ? 1 : 0,
			});
		}
	}

	const ranked = Array.from(playerMap.values())
		.sort((a, b) => b.totalScore - a.totalScore)
		.slice(0, 10); // top 10 only — embeds have character limits

	const embed = leaderboardEmbed(event.name, ranked);

	await interaction.reply({
		embeds: [embed],
		flags: isPublic ? undefined : MessageFlags.Ephemeral,
	});
}
