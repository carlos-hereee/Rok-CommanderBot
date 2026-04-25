import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	AutocompleteInteraction,
	ComponentType,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	MessageFlags,
} from "discord.js";
import { eventStore } from "@db/stores/eventStore.js";
import { embedContent } from "@base/constants/embed-content.js";
import { infoEmbed, errorEmbed } from "@utils/embedBuilder.js";

const c = embedContent.deleteEvent;

export const data = new SlashCommandBuilder()
	.setName("delete-event")
	.setDescription("Delete an active KvK event and stop its reminders")
	.addStringOption((option) =>
		option.setName("event").setDescription("The event to delete").setRequired(true).setAutocomplete(true)
	);

// ── autocomplete ─────────────────────────────────────────────
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
	const events = await eventStore.findByGuildId(interaction.guildId!);
	await interaction.respond(events.map((e) => ({ name: e.name, value: e.eventId })));
}

// ── execute ──────────────────────────────────────────────────
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
	const guildId = interaction.guildId;
	if (!guildId) {
		await interaction.reply({ embeds: [errorEmbed("Run this in a server, not a DM.")], flags: MessageFlags.Ephemeral });
		return;
	}

	const eventId = interaction.options.getString("event", true);
	// findByIdInGuild applies the guild scope at the store layer so the redundant
	// guildId check below has been removed.
	const event = await eventStore.findByIdInGuild(eventId, guildId);

	if (!event) {
		await interaction.reply({
			embeds: [errorEmbed(c.notFound(eventId))],
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// ── confirmation step ────────────────────────────────────
	const confirm = new ButtonBuilder().setCustomId("confirm_delete").setLabel("Delete").setStyle(ButtonStyle.Danger);

	const cancel = new ButtonBuilder().setCustomId("cancel_delete").setLabel("Cancel").setStyle(ButtonStyle.Secondary);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(cancel, confirm);

	const confirmMessage = await interaction.reply({
		embeds: [infoEmbed(c.confirmTitle, c.confirmDescription(event.name), embedContent.COLORS.ERROR)],
		components: [row],
		flags: MessageFlags.Ephemeral,
	});

	try {
		const button = await confirmMessage.awaitMessageComponent({
			componentType: ComponentType.Button,
			time: 60_000,
		});

		if (button.customId === "cancel_delete") {
			await button.update({ embeds: [errorEmbed(c.cancelled)], components: [] });
			return;
		}

		// confirmed — soft delete
		await eventStore.deleteInGuild(event.eventId, guildId);
		await button.update({
			embeds: [infoEmbed(c.confirmTitle, c.successDescription(event.name), embedContent.COLORS.SCHEDULE)],
			components: [],
		});
	} catch {
		// awaitMessageComponent throws on timeout
		await interaction.editReply({ embeds: [errorEmbed(c.timedOut)], components: [] });
	}
}
