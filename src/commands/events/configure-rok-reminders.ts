import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import rokEvents from "@base/constants/rok-events.json" with { type: "json" };
import { GuildEventManager } from "@features/events/GuildEventManager.js";

export const data = new SlashCommandBuilder()
	.setName("configure-rok-reminders")
	.setDescription("Configure reminder for ROK events")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

	// event type is a fixed choice list built from the JSON
	// so admins can only pick real events, no typos possible
	.addStringOption((option) =>
		option
			.setName("event")
			.setDescription("Which ROK event to configure")
			.setRequired(true)
			.addChoices(...rokEvents.events.map((e) => ({ name: e.name, value: e.key })))
	)
	.addIntegerOption((option) =>
		option.setName("month").setDescription("Month the event starts (1-12)").setRequired(true).setMinValue(1).setMaxValue(12)
	)
	.addIntegerOption((option) =>
		option.setName("day").setDescription("Day the event starts (1-31)").setRequired(true).setMinValue(1).setMaxValue(31)
	)
	.addIntegerOption((option) =>
		option
			.setName("hour")
			.setDescription("Hour the event starts in 24hr UTC e.g. 20 for 8PM UTC")
			.setRequired(true)
			.setMinValue(0)
			.setMaxValue(23)
	)
	.addChannelOption((option) => option.setName("channel").setDescription("Channel to post reminders in").setRequired(true))
	.addStringOption((option) =>
		option.setName("description").setDescription("Optional description for this event").setRequired(false)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	const eventKey = interaction.options.getString("event", true);
	const channel = interaction.options.getChannel("channel", true);
	const description = interaction.options.getString("description") ?? "";

	const month = interaction.options.getInteger("month", true);
	const day = interaction.options.getInteger("day", true);
	const hour = interaction.options.getInteger("hour", true);

	// always use current year, pad month/day/hour to 2 digits
	const year = new Date().getUTCFullYear();
	const MM = String(month).padStart(2, "0");
	const DD = String(day).padStart(2, "0");
	const HH = String(hour).padStart(2, "0");

	// build ISO string — minutes and seconds always 00
	// since ROK events always start on the hour
	const firstOccurrence = `${year}-${MM}-${DD}T${HH}:00:00Z`;

	// validate the resulting date is real
	// catches edge cases like month=2 day=31
	const parsed = new Date(firstOccurrence);
	if (isNaN(parsed.getTime()) || parsed.getUTCMonth() + 1 !== month) {
		await interaction.reply({ content: `❌ Invalid date — ${month}/${day} is not a real date.`, ephemeral: true });
		return;
	}

	const eventConfig = rokEvents.events.find((e) => e.key === eventKey);
	if (!eventConfig) {
		await interaction.reply({ content: "Unknown event type. Please select from the list.", ephemeral: true });
		return;
	}

	await GuildEventManager.createEvent(interaction, {
		name: eventConfig.name,
		description,
		intervalHours: eventConfig.intervalHours,
		prepSteps: eventConfig.prepSteps,
		firstOccurrence,
		channelId: channel.id,
	});
}
