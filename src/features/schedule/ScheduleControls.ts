import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Client,
	Guild,
	MessageFlags,
	TextChannel,
	type ButtonInteraction,
} from "discord.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { registerButton } from "@handlers/interactionRegistry.js";
import { errorEmbed } from "@utils/embedBuilder.js";
import { embedContent } from "@base/constants/embed-content.js";
import { postGoLiveAnnouncement } from "@features/schedule/postGoLiveAnnouncement.js";

// ── Schedule channel controls (FUTURE_PLANS item 36, partial) ──────
// Owns the channel-level action buttons attached to the pinned
// schedule board message in the event-schedule channel. Today: one
// button (Go Live Now). Future item 36 work layers Pause Schedule,
// Continue Schedule, etc onto the same row.
//
// Architecture: the buttons live on the SAME message as the schedule
// board (managed by ScheduleBoard). ScheduleBoard.refreshSchedule
// includes the row from buildGoLiveNowButtonRow() in its send + edit
// calls so the buttons persist across every refresh. This avoids a
// second pinned message in the channel.
//
// Note on Discord.js edit semantics: message.edit({ embeds: [...] })
// without a components key preserves the existing components row. So
// in steady state we could pass components only on initial send and
// rely on subsequent embed-only edits to preserve them. ScheduleBoard
// passes them on every send + edit anyway, which is idempotent and
// makes the contract explicit at every call site.

// customId prefix for buttons that live on the schedule board control
// row. Prefix-based dispatch in interactionRegistry slices on the
// first ":" so this prefix can host multiple buttons (eg
// "schedule_controls:pause_schedule" when item 36 expands).
const BUTTON_PREFIX = "schedule_controls";
const GO_LIVE_NOW_CUSTOM_ID = `${BUTTON_PREFIX}:go_live_now`;

// Build the action row that hosts the channel-control buttons.
// Exported so ScheduleBoard can include it in every send and edit of
// the pinned schedule message. Single source of truth — adding a
// button means editing this function and shipping; ScheduleBoard
// automatically picks up the new shape on its next refresh.
export function buildGoLiveNowButtonRow(): ActionRowBuilder<ButtonBuilder> {
	const goLiveButton = new ButtonBuilder()
		.setCustomId(GO_LIVE_NOW_CUSTOM_ID)
		.setLabel("Go Live Now")
		.setEmoji("📺")
		// Success (green) reads as "go", matches the verb. Avoids the
		// emergency-notice framing that Danger (red) would carry, which
		// is the wrong vibe for a celebratory "I am live" action.
		.setStyle(ButtonStyle.Success);

	return new ActionRowBuilder<ButtonBuilder>().addComponents(goLiveButton);
}

// Button handler for "Go Live Now". Registered at boot via
// registerScheduleControlHandlers below.
//
// Permission gate: server owner OR a member of the configured admin
// role. Same model as the ADMIN_COMMANDS gate in main.ts so the rules
// stay consistent across slash commands and buttons.
//
// On authorized click: fires the equivalent of `/go-live-soon when:now`
// with no note and the default member role as the mention target. The
// shared postGoLiveAnnouncement helper handles all the channel /
// embed / allowed-mentions work; this handler only deals with the
// interaction acking.
async function handleGoLiveNowButton(interaction: ButtonInteraction): Promise<void> {
	const guildId = interaction.guildId;
	if (!guildId || !interaction.guild) {
		await interaction.reply({
			embeds: [errorEmbed("This button only works inside a server.")],
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// Load config for the admin role check. If the guild has not
	// completed Phase 2 of setup yet, adminRoleId is null and only the
	// server owner can fire the button.
	const config = await guildConfigStore.findByGuildId(guildId);
	const isOwner = interaction.user.id === interaction.guild.ownerId;
	const member = interaction.guild.members.cache.get(interaction.user.id);
	const hasAdminRole = (config?.adminRoleId && member?.roles.cache.has(config.adminRoleId)) ?? false;

	if (!isOwner && !hasAdminRole) {
		await interaction.reply({
			embeds: [errorEmbed(embedContent.responses.noWizardPowers)],
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// Authorized. Fire the announcement via the shared helper. Note +
	// role override are intentionally null: the button is the panic-
	// button shortcut, the slash command remains the path for richer
	// inputs.
	const result = await postGoLiveAnnouncement(interaction.client, guildId, "now", null, null);

	const c = embedContent.goLiveSoon;
	if (result.ok) {
		await interaction.reply({ content: c.posted, flags: MessageFlags.Ephemeral });
		return;
	}

	const errorMsg =
		result.reason === "setup-required"
			? c.setupRequired
			: result.reason === "invalid-lead-time"
				? c.invalidLeadTime
				: c.postFailed;

	await interaction.reply({
		embeds: [errorEmbed(errorMsg)],
		flags: MessageFlags.Ephemeral,
	});
}

// Register the persistent button handler. Called once at boot from
// main.ts before the InteractionCreate listener installs. Mirrors the
// registerDecreeEditHandlers / registerLeaderboardChannelHandlers
// pattern so the registry is populated synchronously at module load.
export function registerScheduleControlHandlers(): void {
	registerButton(BUTTON_PREFIX, handleGoLiveNowButton);
}

// Boot-time recovery: check whether the stored schedule message
// already has the Go Live Now button attached, and add it if not.
// Covers existing guilds whose schedule board was posted BEFORE this
// feature shipped — those messages have embeds but no components, so
// ScheduleBoard's edit path (which now reapplies components) cannot
// retroactively add them without a triggering refresh. This helper
// forces the attach on boot so the button shows up immediately
// instead of waiting for the next event create / reminder fire.
//
// Idempotent: if the button is already present (any future boot
// after the first), the customId match short-circuits without an
// edit. One Discord round trip to fetch the message; one more only
// if the button needs adding.
export async function ensureGoLiveButtonOnScheduleBoard(client: Client, guild: Guild): Promise<void> {
	const config = await guildConfigStore.findByGuildId(guild.id);
	if (!config?.scheduleChannelId || !config.scheduleMessageId) return;

	const channel = await client.channels.fetch(config.scheduleChannelId).catch(() => null);
	if (!channel || !(channel instanceof TextChannel)) return;

	const message = await channel.messages.fetch(config.scheduleMessageId).catch(() => null);
	if (!message) return;

	// Walk existing components for our button's customId. Discord.js
	// returns components as an array of action rows; each row carries
	// an array of message components. Buttons expose customId; non-
	// button components (select menus etc) do not, so we narrow via
	// the property check. Match by exact id so a future button on the
	// same row (item 36 expansion) does not produce a false positive
	// when only some buttons are present.
	const alreadyHasButton = message.components.some((row) => {
		const components = (row as unknown as { components?: Array<{ customId?: string }> }).components ?? [];
		return components.some((c) => c.customId === GO_LIVE_NOW_CUSTOM_ID);
	});
	if (alreadyHasButton) return;

	// No button. Attach. Preserve the existing embeds so the schedule
	// board content stays untouched — only the components row changes.
	try {
		await message.edit({ embeds: message.embeds, components: [buildGoLiveNowButtonRow()] });
		console.log(`[ScheduleControls] attached Go Live Now button to existing schedule board in guild ${guild.id}`);
	} catch (error) {
		console.warn(`[ScheduleControls] failed to attach Go Live Now button in guild ${guild.id}`, error);
	}
}
