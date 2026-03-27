import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	PermissionFlagsBits,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
} from "discord.js";
import { GuildEventManager } from "@features/events/GuildEventManager.js";
import { kvkConfirmationEmbed } from "@utils/embedBuilder.js";
import { addDays, parseEventDate, parseEventDateTime } from "@utils/dateParser.js";

export const data = new SlashCommandBuilder()
	.setName("configure-rok-reminders")
	.setDescription("Configure reminders for all ROK KvK events")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

	// ── season ───────────────────────────────────────────────
	.addIntegerOption((option) =>
		option
			.setName("days-remaining")
			.setDescription("How many days remain in the current KvK season?")
			.setRequired(true)
			.setMinValue(1)
			.setMaxValue(60)
	)

	// ── ancient ruins ────────────────────────────────────────────
	.addStringOption((option) =>
		option
			.setName("ruins-date-time")
			.setDescription("Next Ancient Ruins date — format: MM/DD @HH e.g. 03/20 @12")
			.setRequired(true)
	)

	// ── altar of darkness ────────────────────────────────────────
	.addStringOption((option) =>
		option
			.setName("altar-date-time")
			.setDescription("Next Altar of Darkness date — format: MM/DD @HH e.g. 03/20 @12")
			.setRequired(true)
	)

	// ── trial of kau karuak ──────────────────────────────────────
	.addStringOption((option) =>
		option.setName("kau-date").setDescription("Trial of Kau Karuak Easy date — format: MM/DD e.g. 03/14").setRequired(true)
	)

	// ── channel ──────────────────────────────────────────────
	.addChannelOption((option) => option.setName("channel").setDescription("Channel to post reminders in").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
	const daysRemaining = interaction.options.getInteger("days-remaining", true);
	const channel = interaction.options.getChannel("channel", true);
	const ruinsInput = interaction.options.getString("ruins-date-time", true);
	const altarInput = interaction.options.getString("altar-date-time", true);
	const kauInput = interaction.options.getString("kau-date", true);

	// ── parse ─────────────────────────────────────────────────
	const ruinsFirst = parseEventDateTime(ruinsInput);
	const altarFirst = parseEventDateTime(altarInput);
	const kauEasy = parseEventDate(kauInput);

	// ── validate ──────────────────────────────────────────────
	const errors: string[] = [];

	if (!ruinsFirst) errors.push("Ruins date invalid — use format MM/DD@HH e.g. `04/20 @12`");
	if (!altarFirst) errors.push("Altar date invalid — use format MM/DD@HH e.g. `04/20 @12`");
	if (!kauEasy) errors.push("Kau Karuak date invalid — use format MM/DD e.g. `04/20`");

	if (errors.length > 0) {
		await interaction.reply({
			content: `❌ Invalid inputs:\n${errors.map((e) => `- ${e}`).join("\n")}`,
			ephemeral: true,
		});
		return;
	}

	// safely assert non-null after validation
	const seasonEnd = new Date();
	seasonEnd.setUTCDate(seasonEnd.getUTCDate() + daysRemaining);
	seasonEnd.setUTCHours(0, 0, 0, 0);

	const kauNormal = addDays(kauEasy!, 14);
	const kauHard = addDays(kauNormal, 17);
	const kauNightmare = addDays(kauHard, 6);

	// ── season range checks ───────────────────────────────────
	const rangeErrors: string[] = [];

	if (ruinsFirst! >= seasonEnd) rangeErrors.push("Ruins date must be before the season end date");
	if (altarFirst! >= seasonEnd) rangeErrors.push("Altar date must be before the season end date");
	if (kauEasy! >= seasonEnd) rangeErrors.push("Kau Karuak Easy date must be before the season end date");

	if (rangeErrors.length > 0) {
		await interaction.reply({
			content: `❌ Date conflicts:\n${rangeErrors.map((e) => `- ${e}`).join("\n")}`,
			ephemeral: true,
		});
		return;
	}

	// ── confirmation embed ────────────────────────────────────
	const confirmEmbed = kvkConfirmationEmbed({
		seasonEnd,
		ruinsFirst: ruinsFirst!,
		altarFirst: altarFirst!,
		kauEasy: kauEasy!,
		kauNormal,
		kauHard,
		kauNightmare,
		channelId: channel.id,
	});

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("confirm_rok_config")
			.setLabel("✅ Confirm — Dates are correct")
			.setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId("edit_rok_config").setLabel("✏️ Edit — Dates need changing").setStyle(ButtonStyle.Secondary)
	);

	const confirmMessage = await interaction.reply({
		embeds: [confirmEmbed],
		components: [row],
		ephemeral: true,
	});

	// ── await button press ───────────────────────────────────
	try {
		const confirmation = await confirmMessage.awaitMessageComponent({ componentType: ComponentType.Button, time: 120_000 });

		if (confirmation.customId === "edit_rok_config") {
			await confirmation.update({
				content: "❌ Configuration cancelled — run `/configure-rok-reminders` again with the correct dates.",
				embeds: [],
				components: [],
			});
			return;
		}

		if (confirmation.customId === "confirm_rok_config") {
			await confirmation.update({ content: "⏳ Setting up reminders...", embeds: [], components: [] });

			await GuildEventManager.configureKvKSeason(interaction, {
				seasonEnd,
				ruinsFirst: ruinsFirst!,
				altarFirst: altarFirst!,
				kauEasy: kauEasy!,
				kauNormal,
				kauHard,
				kauNightmare,
				channelId: channel.id,
			});
		}
	} catch {
		await interaction.editReply({
			content: "⏱️ Configuration timed out — please run the command again.",
			embeds: [],
			components: [],
		});
	}
}
