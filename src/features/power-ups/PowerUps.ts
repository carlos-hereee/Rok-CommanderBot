import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Client,
	ColorResolvable,
	DiscordAPIError,
	EmbedBuilder,
	Guild,
	Message,
	MessageFlags,
	TextChannel,
	type ButtonInteraction,
} from "discord.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { registerButton } from "@handlers/interactionRegistry.js";
import { gateOwnerOrAdmin } from "@utils/permissions.js";
import { errorEmbed, infoEmbed } from "@utils/embedBuilder.js";
import { embedContent } from "@base/constants/embed-content.js";
import { refreshLeaderboard } from "@features/leaderboard/LeaderboardBoard.js";

// ── Channel power-ups (v1.6 Phase 5, item 36) ──────────────────────────
// Each homebase channel carries a pinned "power-up" panel: an embed + a row of
// buttons that put the common channel actions one click away in Discord, no
// slash command required. The panel is a SEPARATE pinned message from any board
// in the channel (it complements the auto leaderboard board and the schedule
// board rather than replacing them).
//
// Architecture mirrors the rest of the bot's persistent-button surfaces:
//  - customId scheme `powerup:<kind>:<action>`, dispatched on the "powerup"
//    prefix through interactionRegistry; this handler splits the rest.
//  - one registerButton("powerup", ...) handles every panel button and routes
//    by kind + action.
//  - panels are posted + repaired on the boot sweep (ensureAllPowerUps),
//    persisting message ids on GuildConfig.powerUpMessageIds, the same way
//    ScheduleBoard and the intro embeds are kept alive across restarts.
//
// Panels shipped here: leaderboard "Refresh standings" (admin, Phase 2
// refreshLeaderboard), intro "Post intro template" (any member), and
// announcements "Toggle announcement pings" (any member). The schedule channel
// is deliberately NOT a power-up panel: its controls (Go Live + a phase-gated
// Pause/Resume toggle) live on the schedule board itself, owned by
// ScheduleControls, so the board's refresh-on-event-change keeps them current.

const POWERUP_PREFIX = "powerup";

// Neutral, voice-agnostic self-intro scaffold handed to a member (ephemerally)
// when they tap "Post intro template". Kept inline like the rest of the panel
// copy; could move to the copy packs later if per-pack voice is wanted. Sent in
// a code block so the member can copy it cleanly, fill it in, and post it.
const INTRO_TEMPLATE = [
	"Here's a quick intro template. Copy it, fill it in, and post it in this channel:",
	"",
	"```",
	"Name / handle:",
	"Where you're from (a timezone is fine):",
	"How you found this server:",
	"What you're into:",
	"One thing you're hoping to get out of being here:",
	"```",
].join("\n");

interface IPowerUpAction {
	// the <action> segment of the customId; unique within a panel
	action: string;
	label: string;
	emoji?: string;
	style: ButtonStyle;
	// owner/admin-gated when true; open to any member when false
	adminOnly: boolean;
}

interface IPowerUpDefinition {
	// the <kind> segment of the customId, and the log label
	kind: string;
	// GuildConfig field holding this channel's id AND the powerUpMessageIds key
	channelField: string;
	title: string;
	description: string;
	color: ColorResolvable;
	actions: IPowerUpAction[];
}

const POWERUP_DEFINITIONS: IPowerUpDefinition[] = [
	{
		kind: "leaderboard",
		channelField: "leaderboardChannelId",
		title: "🏆 Leaderboard controls",
		description: "Refresh the standings board on demand. Admins only.",
		color: embedContent.COLORS.LEADERBOARD,
		actions: [{ action: "refresh", label: "Refresh standings", emoji: "🔄", style: ButtonStyle.Primary, adminOnly: true }],
	},
	{
		kind: "intro",
		channelField: "introChannelId",
		title: "👋 Introduce yourself",
		description: "New here? Tap below for a quick intro template to fill in and post.",
		color: embedContent.COLORS.ARRIVAL,
		actions: [{ action: "template", label: "Post intro template", emoji: "📝", style: ButtonStyle.Primary, adminOnly: false }],
	},
	{
		kind: "announcements",
		channelField: "announcementsChannelId",
		title: "🔔 Announcement pings",
		description: "Want a heads-up when this server posts an announcement? Tap to opt in or out.",
		color: embedContent.COLORS.ANNOUNCEMENTS,
		actions: [{ action: "subscribe", label: "Toggle announcement pings", emoji: "🔔", style: ButtonStyle.Secondary, adminOnly: false }],
	},
];

// ── button handling ────────────────────────────────────────────────────

async function handlePowerUpButton(interaction: ButtonInteraction): Promise<void> {
	// customId: powerup:<kind>:<action>
	const parts = interaction.customId.split(":");
	const kind = parts[1];
	const action = parts[2];
	const def = kind ? POWERUP_DEFINITIONS.find((d) => d.kind === kind) : undefined;
	const actionDef = def?.actions.find((a) => a.action === action);

	// Unknown / retired control (stale panel from an older deploy). Ack quietly.
	if (!def || !actionDef) {
		await interaction.reply({ content: "This control is no longer available.", flags: MessageFlags.Ephemeral });
		return;
	}

	const guildId = interaction.guildId;
	if (!guildId || !interaction.guild) {
		await interaction.reply({ embeds: [errorEmbed("This button only works inside a server.")], flags: MessageFlags.Ephemeral });
		return;
	}

	// Per-action gate. Persistent buttons cannot rely on a slash command's
	// permission filter, so admin-only actions re-verify the clicker here.
	if (actionDef.adminOnly) {
		const config = await guildConfigStore.findByGuildId(guildId);
		const allowed = await gateOwnerOrAdmin(interaction, config);
		if (!allowed) {
			await interaction.reply({ embeds: [errorEmbed(embedContent.responses.noWizardPowers)], flags: MessageFlags.Ephemeral });
			return;
		}
	}

	switch (`${def.kind}:${actionDef.action}`) {
		case "leaderboard:refresh":
			await runLeaderboardRefresh(interaction, guildId);
			return;
		case "intro:template":
			await runPostIntroTemplate(interaction);
			return;
		case "announcements:subscribe":
			await runToggleNotificationRole(interaction, guildId);
			return;
		default:
			// Defined in the panel but not yet wired to logic — should not happen
			// for shipped actions, but keeps the switch exhaustive and loud.
			await interaction.reply({ content: "This control is not wired up yet.", flags: MessageFlags.Ephemeral });
	}
}

async function runLeaderboardRefresh(interaction: ButtonInteraction, guildId: string): Promise<void> {
	// Defer: refreshLeaderboard does Discord I/O (channel fetch + message edit)
	// which can exceed the 3s interaction-ack window on a cold cache.
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	// refreshLeaderboard is fire-and-forget by contract (swallows + logs its own
	// errors), so we cannot tell success from a silently-handled failure; await
	// it so the board is updated before we ack, then confirm generically.
	await refreshLeaderboard(interaction.client, guildId);
	await interaction.editReply({ content: "🔄 Standings refreshed." });
}

async function runPostIntroTemplate(interaction: ButtonInteraction): Promise<void> {
	// Ephemeral so repeated clicks never spam the channel — the member gets a
	// private copy to fill in and post themselves.
	await interaction.reply({ content: INTRO_TEMPLATE, flags: MessageFlags.Ephemeral });
}

async function runToggleNotificationRole(interaction: ButtonInteraction, guildId: string): Promise<void> {
	if (!interaction.guild) {
		await interaction.reply({ embeds: [errorEmbed("This only works inside a server.")], flags: MessageFlags.Ephemeral });
		return;
	}
	const config = await guildConfigStore.findByGuildId(guildId);
	if (!config) {
		await interaction.reply({ embeds: [errorEmbed("This server is not set up yet.")], flags: MessageFlags.Ephemeral });
		return;
	}

	try {
		// Resolve the notifications role, creating it lazily on first use (and
		// recreating it if an admin deleted it). Mentionable so a future
		// announcement flow can @ping opted-in members; a freshly created role
		// lands at the bottom of the list, below the bot, so it stays assignable.
		const storedRoleId = (config as unknown as { notificationsRoleId?: string | null }).notificationsRoleId ?? null;
		let role =
			(storedRoleId ? interaction.guild.roles.cache.get(storedRoleId) : null) ??
			(storedRoleId ? await interaction.guild.roles.fetch(storedRoleId).catch(() => null) : null);
		if (!role) {
			role = await interaction.guild.roles.create({ name: "🔔 Announcements", mentionable: true, reason: "Announcement ping opt-in role" });
			await guildConfigStore.update(guildId, { notificationsRoleId: role.id });
		}

		// Resolve the clicking member cache-first, fetch fallback (the cache can be
		// cold on a fresh restart).
		let member = interaction.guild.members.cache.get(interaction.user.id) ?? null;
		if (!member) member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
		if (!member) {
			await interaction.reply({ embeds: [errorEmbed("Could not resolve your membership. Try again in a moment.")], flags: MessageFlags.Ephemeral });
			return;
		}

		// Toggle: state is conveyed through this ephemeral reply, not the button
		// label (a shared button label cannot be per-user).
		if (member.roles.cache.has(role.id)) {
			await member.roles.remove(role.id, "Announcement ping opt-out");
			await interaction.reply({ content: "🔕 You're off the announcement ping list.", flags: MessageFlags.Ephemeral });
		} else {
			await member.roles.add(role.id, "Announcement ping opt-in");
			await interaction.reply({ content: "🔔 You're on the announcement ping list. Tap again to opt out.", flags: MessageFlags.Ephemeral });
		}
	} catch (err) {
		console.error(`[powerup] toggle notification role failed in guild ${guildId}`, err);
		await interaction.reply({
			embeds: [errorEmbed("Could not update your notifications. The bot may be missing the Manage Roles permission. Try again in a moment.")],
			flags: MessageFlags.Ephemeral,
		});
	}
}

/**
 * Register the power-up button handler. Called once at boot from main.ts
 * alongside the other registerXHandlers, BEFORE the InteractionCreate listener.
 */
export function registerPowerUpHandlers(): void {
	registerButton(POWERUP_PREFIX, handlePowerUpButton);
}

// ── panel message building ──────────────────────────────────────────────

function buildPowerUpEmbed(def: IPowerUpDefinition): EmbedBuilder {
	return infoEmbed(def.title, def.description, def.color);
}

function buildPowerUpComponents(def: IPowerUpDefinition): ActionRowBuilder<ButtonBuilder>[] {
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	// Discord caps an action row at 5 buttons; chunk so a panel with more than
	// 5 actions still renders (current panels have 1-2).
	for (let i = 0; i < def.actions.length; i += 5) {
		const slice = def.actions.slice(i, i + 5);
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			slice.map((a) => {
				const button = new ButtonBuilder().setCustomId(`${POWERUP_PREFIX}:${def.kind}:${a.action}`).setLabel(a.label).setStyle(a.style);
				if (a.emoji) button.setEmoji(a.emoji);
				return button;
			})
		);
		rows.push(row);
	}
	return rows;
}

// ── boot sweep: post + repair panels ─────────────────────────────────────

// Post-or-edit one panel. Returns the message id to persist (the existing id on
// a successful edit or a bail, the new id on a repost). Mirrors
// ScheduleBoard.postOrEdit but simpler: on an author mismatch it bails quietly
// and lets ScheduleBoard own the homebase rebuild rather than re-running it.
async function postOrEditPanel(channel: TextChannel, storedId: string | null, def: IPowerUpDefinition, guildId: string): Promise<string | null> {
	const embed = buildPowerUpEmbed(def);
	const components = buildPowerUpComponents(def);
	const selfId = channel.client.user?.id;

	if (storedId) {
		try {
			const existing = await channel.messages.fetch(storedId);
			if (selfId && existing.author.id !== selfId) {
				console.warn(`[powerup] ${def.kind} panel ${storedId} in guild ${guildId} not authored by this bot; skipping`);
				return storedId;
			}
			// message.edit must pass BOTH embeds and components or the buttons drop.
			await existing.edit({ embeds: [embed], components });
			return storedId;
		} catch (error) {
			if (error instanceof DiscordAPIError && (error.code === 10008 || error.code === 10003)) {
				// 10008 Unknown Message (admin deleted it) / 10003 Unknown Channel —
				// fall through to repost a fresh panel.
				console.warn(`[powerup] ${def.kind} panel ${storedId} in guild ${guildId} was deleted; reposting`);
			} else if (error instanceof DiscordAPIError && error.code === 50005) {
				console.warn(`[powerup] ${def.kind} panel ${storedId} in guild ${guildId} authored by another bot; skipping`);
				return storedId;
			} else {
				console.error(`[powerup] failed to edit ${def.kind} panel ${storedId} in guild ${guildId}`, error);
				return storedId; // leave the id; retry on the next boot
			}
		}
	}

	// First post (or recovery): send, pin best-effort, return the new id.
	let message: Message;
	try {
		message = await channel.send({ embeds: [embed], components });
	} catch (error) {
		console.error(`[powerup] failed to post ${def.kind} panel in guild ${guildId}`, error);
		return storedId;
	}
	try {
		await message.pin();
	} catch (error) {
		console.warn(`[powerup] pin failed for ${def.kind} panel in guild ${guildId} (likely missing ManageMessages)`, error);
	}
	return message.id;
}

/**
 * Post or repair every defined power-up panel for one guild, persisting the
 * message ids in a single GuildConfig write. Safe to call repeatedly — steady
 * state is one fetch + one edit per panel and no DB write.
 */
export async function ensurePowerUps(client: Client, guild: Guild): Promise<void> {
	const config = await guildConfigStore.findByGuildId(guild.id);
	if (!config) return;

	// Dynamic field access: the panel defs key channels by their GuildConfig
	// field name (e.g. "leaderboardChannelId"). Cast once so the lookup typechecks.
	const channelIds = config as unknown as Record<string, string | null | undefined>;
	const existingIds = (config.powerUpMessageIds ?? {}) as unknown as Record<string, string | null>;
	const nextIds: Record<string, string | null> = { ...existingIds };
	let changed = false;

	for (const def of POWERUP_DEFINITIONS) {
		const channelId = channelIds[def.channelField] ?? null;
		if (!channelId) continue; // channel not provisioned (legacy / incomplete setup)

		const channel = await client.channels.fetch(channelId).catch(() => null);
		if (!(channel instanceof TextChannel)) continue;

		const storedId = existingIds[def.channelField] ?? null;
		const resultId = await postOrEditPanel(channel, storedId, def, guild.id);
		if (resultId && resultId !== storedId) {
			nextIds[def.channelField] = resultId;
			changed = true;
		}
	}

	// One write per guild, only when an id actually changed (first post or repost).
	if (changed) await guildConfigStore.update(guild.id, { powerUpMessageIds: nextIds });
}

/**
 * Boot-sweep entry point: ensure panels for every guild. Per-guild failures are
 * logged and swallowed so one guild cannot stall the rest. Called from main.ts
 * after the homebase sweep + board refreshes so the channels exist first.
 */
export async function ensureAllPowerUps(client: Client): Promise<void> {
	for (const guild of client.guilds.cache.values()) {
		await ensurePowerUps(client, guild).catch((error) => console.error(`[powerup] ensure failed for guild ${guild.id}`, error));
	}
}
