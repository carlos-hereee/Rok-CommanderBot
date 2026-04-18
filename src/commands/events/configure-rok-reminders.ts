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
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { kvkConfirmationEmbed, errorEmbed } from "@utils/embedBuilder.js";
import { addDays, parseEventDate, parseEventDateTime } from "@utils/dateParser.js";
import { embedContent } from "@base/constants/embed-content.js";

const { configureReminders } = embedContent;

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
	);

// NOTE: the old `channel` option has been removed. reminders always post to
// the guild's announcements channel (guildConfig.announcementsChannelId),
// which the bot auto-creates during onboarding. asking the admin to pick a
// channel every time they ran this command was dead weight since the home
// base already has exactly one announcement channel.

export async function execute(interaction: ChatInputCommandInteraction) {
	const daysRemaining = interaction.options.getInteger("days-remaining", true);
	const ruinsInput = interaction.options.getString("ruins-date-time", true);
	const altarInput = interaction.options.getString("altar-date-time", true);
	const kauInput = interaction.options.getString("kau-date", true);

	// ── resolve the announcements channel from guild config ─────
	// the source of truth for "where do reminders go" is the guild's
	// configured announcements channel, not a per-command option. if
	// /setup has not run yet this command cannot proceed.
	const config = await guildConfigStore.findByGuildId(interaction.guildId!);
	if (!config?.announcementsChannelId) {
		await interaction.reply({
			embeds: [errorEmbed(configureReminders.setupRequired)],
			ephemeral: true,
		});
		return;
	}
	const announcementsChannelId = config.announcementsChannelId;

	// ── parse ─────────────────────────────────────────────────
	const ruinsFirst = parseEventDateTime(ruinsInput);
	const altarFirst = parseEventDateTime(altarInput);
	const kauEasy = parseEventDate(kauInput);

	// ── validate ──────────────────────────────────────────────
	const errors: string[] = [];

	if (!ruinsFirst) errors.push(configureReminders.ruinsInvalid);
	if (!altarFirst) errors.push(configureReminders.altarInvalid);
	if (!kauEasy) errors.push(configureReminders.kauInvalid);

	if (errors.length > 0) {
		await interaction.reply({
			content: `${configureReminders.invalidInputsHeader}\n${configureReminders.bulletList(errors)}`,
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

	if (ruinsFirst! >= seasonEnd) rangeErrors.push(configureReminders.ruinsAfterSeason);
	if (altarFirst! >= seasonEnd) rangeErrors.push(configureReminders.altarAfterSeason);
	if (kauEasy! >= seasonEnd) rangeErrors.push(configureReminders.kauAfterSeason);

	if (rangeErrors.length > 0) {
		await interaction.reply({
			content: `${configureReminders.dateConflictsHeader}\n${configureReminders.bulletList(rangeErrors)}`,
			ephemeral: true,
		});
		return;
	}

	// ── confirmation embed ────────────────────────────────────
	// still passes channelId through so the confirmation preview can show the
	// admin exactly where the reminders will post, even though it is no longer
	// a user-supplied option.
	const confirmEmbed = kvkConfirmationEmbed({
		seasonEnd,
		ruinsFirst: ruinsFirst!,
		altarFirst: altarFirst!,
		kauEasy: kauEasy!,
		kauNormal,
		kauHard,
		kauNightmare,
		channelId: announcementsChannelId,
	});

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("confirm_rok_config")
			.setLabel(configureReminders.confirmButtonLabel)
			.setStyle(ButtonStyle.Success),
		new ButtonBuilder()
			.setCustomId("edit_rok_config")
			.setLabel(configureReminders.editButtonLabel)
			.setStyle(ButtonStyle.Secondary)
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
				content: configureReminders.cancelled,
				embeds: [],
				components: [],
			});
			return;
		}

		if (confirmation.customId === "confirm_rok_config") {
			await confirmation.update({ content: configureReminders.settingUp, embeds: [], components: [] });

			await GuildEventManager.configureKvKSeason(interaction, {
				seasonEnd,
				ruinsFirst: ruinsFirst!,
				altarFirst: altarFirst!,
				kauEasy: kauEasy!,
				kauNormal,
				kauHard,
				kauNightmare,
			});
		}
	} catch {
		await interaction.editReply({
			content: configureReminders.timedOut,
			embeds: [],
			components: [],
		});
	}
}
