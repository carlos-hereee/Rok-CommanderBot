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
import { refreshSchedule } from "@features/schedule/ScheduleBoard.js";
import { pauseAllGuildEvents, resumeAllGuildEvents, IBulkScheduleResult } from "@features/schedule/scheduleBulkControls.js";

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
// This first increment ships the two owner/admin panels that reuse existing
// logic: the leaderboard "Refresh standings" (Phase 2 refreshLeaderboard) and
// the schedule "Pause all / Resume all" (scheduleBulkControls). The intro
// "Post intro template" and announcements "Subscribe to ping list" member-
// facing panels slot into POWERUP_DEFINITIONS next without schema changes.

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
		kind: "schedule",
		channelField: "scheduleChannelId",
		title: "📅 Schedule controls",
		description: "Pause or resume reminders for every schedule on this server. Admins only.",
		color: embedContent.COLORS.SCHEDULE,
		actions: [
			{ action: "pause", label: "Pause all", emoji: "⏸️", style: ButtonStyle.Secondary, adminOnly: true },
			{ action: "continue", label: "Resume all", emoji: "▶️", style: ButtonStyle.Success, adminOnly: true },
		],
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
		case "schedule:pause":
			await runBulkSchedule(interaction, guildId, "paused");
			return;
		case "schedule:continue":
			await runBulkSchedule(interaction, guildId, "resumed");
			return;
		case "intro:template":
			await runPostIntroTemplate(interaction);
			return;
		case "announcements:subscribe":
			await runTogglePingSubscription(interaction, guildId);
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

async function runBulkSchedule(interaction: ButtonInteraction, guildId: string, action: "paused" | "resumed"): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	const result = action === "paused" ? await pauseAllGuildEvents(guildId) : await resumeAllGuildEvents(guildId);
	// Update the schedule board's paused tags. Fire-and-forget — the DB writes
	// are the source of truth and the next refresh tick reconciles regardless.
	refreshSchedule(interaction.client, guildId).catch((err) => console.error(`[powerup] schedule refresh after ${action} failed`, err));
	await interaction.editReply({ content: summarizeBulk(result, action) });
}

function summarizeBulk(result: IBulkScheduleResult, action: "paused" | "resumed"): string {
	if (result.total === 0) return "There are no schedules on this server yet.";
	if (result.changed === 0) {
		return action === "paused" ? "Every schedule was already paused." : "Nothing was paused, so there is nothing to resume.";
	}
	const verb = action === "paused" ? "⏸️ Paused" : "▶️ Resumed";
	const noun = result.changed === 1 ? "schedule" : "schedules";
	const tail = result.failed > 0 ? ` (${result.failed} could not be updated — check the bot's logs)` : "";
	return `${verb} ${result.changed} ${noun}${tail}.`;
}

async function runPostIntroTemplate(interaction: ButtonInteraction): Promise<void> {
	// Ephemeral so repeated clicks never spam the channel — the member gets a
	// private copy to fill in and post themselves.
	await interaction.reply({ content: INTRO_TEMPLATE, flags: MessageFlags.Ephemeral });
}

async function runTogglePingSubscription(interaction: ButtonInteraction, guildId: string): Promise<void> {
	const config = await guildConfigStore.findByGuildId(guildId);
	if (!config) {
		await interaction.reply({ embeds: [errorEmbed("This server is not set up yet.")], flags: MessageFlags.Ephemeral });
		return;
	}

	// Toggle: the same button opts a member in and out. pingSubscribers is read
	// through a cast because it is a plain string-array field Mongoose's inferred
	// type does not always surface cleanly (same pattern as userRemovedChannels).
	const subscribers = new Set<string>((config as unknown as { pingSubscribers?: string[] }).pingSubscribers ?? []);
	const userId = interaction.user.id;
	const nowSubscribed = !subscribers.has(userId);
	if (nowSubscribed) subscribers.add(userId);
	else subscribers.delete(userId);

	try {
		await guildConfigStore.update(guildId, { pingSubscribers: Array.from(subscribers) });
		await interaction.reply({
			content: nowSubscribed
				? "🔔 You're on the announcement ping list. Tap again to opt out."
				: "🔕 You're off the announcement ping list.",
			flags: MessageFlags.Ephemeral,
		});
	} catch (err) {
		console.error(`[powerup] toggle ping subscription failed in guild ${guildId}`, err);
		await interaction.reply({
			embeds: [errorEmbed("Could not update your subscription. Try again in a moment.")],
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
