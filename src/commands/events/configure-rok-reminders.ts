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

	// ── ancient ruins ────────────────────────────────────────
	.addIntegerOption((option) =>
		option
			.setName("ruins-month")
			.setDescription("Month of the next Ancient Ruins (1-12)")
			.setRequired(true)
			.setMinValue(1)
			.setMaxValue(12)
	)
	.addIntegerOption((option) =>
		option
			.setName("ruins-day")
			.setDescription("Day of the next Ancient Ruins (1-31)")
			.setRequired(true)
			.setMinValue(1)
			.setMaxValue(31)
	)
	.addIntegerOption((option) =>
		option
			.setName("ruins-hour")
			.setDescription("Hour of the next Ancient Ruins (0-23 UTC)")
			.setRequired(true)
			.setMinValue(0)
			.setMaxValue(23)
	)

	// ── altar of darkness ────────────────────────────────────
	.addIntegerOption((option) =>
		option
			.setName("altar-month")
			.setDescription("Month of the next Altar of Darkness (1-12)")
			.setRequired(true)
			.setMinValue(1)
			.setMaxValue(12)
	)
	.addIntegerOption((option) =>
		option
			.setName("altar-day")
			.setDescription("Day of the next Altar of Darkness (1-31)")
			.setRequired(true)
			.setMinValue(1)
			.setMaxValue(31)
	)
	.addIntegerOption((option) =>
		option
			.setName("altar-hour")
			.setDescription("Hour of the next Altar of Darkness (0-23 UTC)")
			.setRequired(true)
			.setMinValue(0)
			.setMaxValue(23)
	)

	// ── trial of kau karuak (easy only — rest calculated) ────
	.addIntegerOption((option) =>
		option
			.setName("kau-month")
			.setDescription("Month of Trial of Kau Karuak Easy (1-12)")
			.setRequired(true)
			.setMinValue(1)
			.setMaxValue(12)
	)
	.addIntegerOption((option) =>
		option
			.setName("kau-day")
			.setDescription("Day of Trial of Kau Karuak Easy (1-31)")
			.setRequired(true)
			.setMinValue(1)
			.setMaxValue(31)
	)

	// ── channel ──────────────────────────────────────────────
	.addChannelOption((option) => option.setName("channel").setDescription("Channel to post reminders in").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
	const year = new Date().getUTCFullYear();
	const pad = (n: number) => String(n).padStart(2, "0");

	// ── collect inputs ───────────────────────────────────────
	const daysRemaining = interaction.options.getInteger("days-remaining", true);
	const channel = interaction.options.getChannel("channel", true);

	const ruinsMonth = interaction.options.getInteger("ruins-month", true);
	const ruinsDay = interaction.options.getInteger("ruins-day", true);
	const ruinsHour = interaction.options.getInteger("ruins-hour", true);

	const altarMonth = interaction.options.getInteger("altar-month", true);
	const altarDay = interaction.options.getInteger("altar-day", true);
	const altarHour = interaction.options.getInteger("altar-hour", true);

	const kauMonth = interaction.options.getInteger("kau-month", true);
	const kauDay = interaction.options.getInteger("kau-day", true);

	// ── calculate dates ──────────────────────────────────────
	const seasonEnd = new Date();
	seasonEnd.setUTCDate(seasonEnd.getUTCDate() + daysRemaining);
	seasonEnd.setUTCHours(0, 0, 0, 0);

	const ruinsFirst = new Date(`${year}-${pad(ruinsMonth)}-${pad(ruinsDay)}T${pad(ruinsHour)}:00:00Z`);
	const altarFirst = new Date(`${year}-${pad(altarMonth)}-${pad(altarDay)}T${pad(altarHour)}:00:00Z`);

	// kau karuak always starts at 00:00 UTC
	const kauEasy = new Date(`${year}-${pad(kauMonth)}-${pad(kauDay)}T00:00:00Z`);

	// calculate remaining difficulties from easy anchor
	const kauNormal = addDays(kauEasy, 14);
	const kauHard = addDays(kauNormal, 17);
	const kauNightmare = addDays(kauHard, 6);

	// ── validate ─────────────────────────────────────────────
	const errors: string[] = [];

	if (isInvalidDate(ruinsFirst, ruinsMonth)) {
		errors.push(`Ruins: ${ruinsMonth}/${ruinsDay} is not a valid date`);
	}
	if (isInvalidDate(altarFirst, altarMonth)) {
		errors.push(`Altar: ${altarMonth}/${altarDay} is not a valid date`);
	}
	if (isInvalidDate(kauEasy, kauMonth)) {
		errors.push(`Kau Karuak: ${kauMonth}/${kauDay} is not a valid date`);
	}
	if (ruinsFirst >= seasonEnd) {
		errors.push("Ruins first occurrence must be before the season end date");
	}
	if (altarFirst >= seasonEnd) {
		errors.push("Altar first occurrence must be before the season end date");
	}
	if (kauEasy >= seasonEnd) {
		errors.push("Kau Karuak Easy must be before the season end date");
	}

	if (errors.length > 0) {
		await interaction.reply({
			content: `❌ Invalid inputs:\n${errors.map((e) => `- ${e}`).join("\n")}`,
			ephemeral: true,
		});
		return;
	}

	const confirmEmbed = kvkConfirmationEmbed({
		seasonEnd,
		ruinsFirst,
		altarFirst,
		kauEasy,
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
				ruinsFirst,
				altarFirst,
				kauEasy,
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

// ── helpers ──────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setUTCDate(result.getUTCDate() + days);
	return result;
}

function isInvalidDate(date: Date, expectedMonth: number): boolean {
	return isNaN(date.getTime()) || date.getUTCMonth() + 1 !== expectedMonth;
}
