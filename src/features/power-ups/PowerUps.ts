import { ButtonBuilder, ButtonStyle, Client, Guild, MessageFlags, TextChannel, type ButtonInteraction } from "discord.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { registerButton } from "@handlers/interactionRegistry.js";
import { gateOwnerOrAdmin } from "@utils/permissions.js";
import { errorEmbed } from "@utils/embedBuilder.js";
import { rokCommanderCopy } from "@base/copy/packs/rok-commander.pack.js";
import { refreshLeaderboard } from "@features/leaderboard/LeaderboardBoard.js";
import { welcomeNewMember } from "@features/greeter/welcomeNewMember.js";

// ── Channel controls (v1.6 item 36; folded into intro guides 2026-06) ──────
// The bot's common channel actions are one-click buttons in Discord, no slash
// command required. They USED to live on standalone pinned "power-up" panel
// messages; they are now BUTTONS on the pinned intro guides instead:
//   • #command-center guide: "Toggle announcement pings" + "Say hello" (any member)
//   • admin-controls guide:  "Refresh standings" (owner/admin)
// resolveIntroComponents (GuildSetupManager) composes these — built by the
// factories below — into the guide rows alongside the suggestion-box, invite,
// and self-destruct buttons.
//
// This module still owns the button BEHAVIOUR:
//  - customId scheme `powerup:<kind>:<action>`, dispatched on the "powerup"
//    prefix through interactionRegistry; handlePowerUpButton splits + gates +
//    routes. The host message does not matter — routing is purely by customId.
//  - the one-time removeAllPowerUpPanels sweep deletes the OLD standalone panels
//    from guilds set up before the fold-in.
// The schedule channel is deliberately NOT here: its controls (Go Live + a
// phase-gated Pause/Resume toggle) live on the schedule board itself, owned by
// ScheduleControls.

const POWERUP_PREFIX = "powerup";

// The folded controls, keyed by `<kind>:<action>` (the customId tail). The
// handler reads this table to (a) reject unknown/retired customIds and (b)
// decide whether to gate the click. "Say hello" is member-usable — any member
// can fire their own welcome + icebreaker — so it is NOT adminOnly.
const POWERUP_ACTIONS = {
	"member:subscribe": { adminOnly: false },
	"member:greet": { adminOnly: false },
	"admin:refresh": { adminOnly: true },
} as const satisfies Record<string, { adminOnly: boolean }>;

// ── button factories (folded into the intro guides) ──────────────────────
// Built here so the customIds stay co-located with the handler that routes them.
// Returned as bare ButtonBuilders so resolveIntroComponents can pack several into
// one ActionRow. The customIds MUST match POWERUP_ACTIONS / the switch below.

// #command-center guide row: announcement-ping toggle + "Say hello" (both open
// to any member). Secondary style so the Suggestion Box (Primary) stays the row's
// visual lead.
export function buildMemberControlButtons(): ButtonBuilder[] {
	return [
		new ButtonBuilder().setCustomId(`${POWERUP_PREFIX}:member:subscribe`).setLabel("Toggle announcement pings").setEmoji("🔔").setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId(`${POWERUP_PREFIX}:member:greet`).setLabel("Say hello").setEmoji("👋").setStyle(ButtonStyle.Secondary),
	];
}

// admin-controls guide row: refresh the leaderboard standings. Owner/admin gated
// in handlePowerUpButton via POWERUP_ACTIONS.
export function buildAdminControlButtons(): ButtonBuilder[] {
	return [
		new ButtonBuilder().setCustomId(`${POWERUP_PREFIX}:admin:refresh`).setLabel("Refresh standings").setEmoji("🔄").setStyle(ButtonStyle.Primary),
	];
}

// ── button handling ────────────────────────────────────────────────────

async function handlePowerUpButton(interaction: ButtonInteraction): Promise<void> {
	// customId: powerup:<kind>:<action> → key on the `<kind>:<action>` tail.
	const parts = interaction.customId.split(":");
	const key = `${parts[1]}:${parts[2]}`;
	const actionDef = POWERUP_ACTIONS[key as keyof typeof POWERUP_ACTIONS] as { adminOnly: boolean } | undefined;

	// Unknown / retired control (a stale button from an older layout). Ack quietly.
	if (!actionDef) {
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
			await interaction.reply({ embeds: [errorEmbed(rokCommanderCopy.responses.noWizardPowers)], flags: MessageFlags.Ephemeral });
			return;
		}
	}

	switch (key) {
		case "admin:refresh":
			await runLeaderboardRefresh(interaction, guildId);
			return;
		case "member:greet":
			await runFireGreeting(interaction);
			return;
		case "member:subscribe":
			await runToggleNotificationRole(interaction, guildId);
			return;
		default:
			// In POWERUP_ACTIONS but not wired here — should not happen for shipped
			// actions, but keeps the switch exhaustive and loud.
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

async function runFireGreeting(interaction: ButtonInteraction): Promise<void> {
	// Fire the real new-member greeting flow for the clicking member: the same
	// path a join takes (a pack-voiced welcome framing + a random icebreaker,
	// posted to the introductions channel pinging them). Member-usable — anyone
	// can drop a fresh icebreaker or re-introduce themselves on demand. Reuses
	// welcomeNewMember so the on-demand fire and the on-join fire never drift.
	// Silent ack: the posted greeting IS the visible feedback, so there is no
	// ephemeral success reply (it was just clutter). deferUpdate acknowledges the
	// click without a "thinking" state and buys time for welcomeNewMember's
	// channel I/O; we only speak up (ephemeral followUp) when nothing got posted
	// so a dud click is not left silent.
	await interaction.deferUpdate();
	let member = interaction.guild?.members.cache.get(interaction.user.id) ?? null;
	if (!member) member = (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null)) ?? null;
	const sent = member ? await welcomeNewMember(member) : false;
	if (!sent) {
		await interaction.followUp({
			content: "Could not post a greeting. Check that the introductions channel exists and the bot can post there.",
			flags: MessageFlags.Ephemeral,
		});
	}
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

	// The bot only ever pings the member role the admin chose at /setup
	// (config.memberRoleId — see fireReminder). So "announcement pings" is just
	// membership in THAT role; there is no separate ping role to create. Note
	// this means opting out removes the member role outright (its job here is to
	// be the pinged role).
	const memberRoleId = config.memberRoleId;
	if (!memberRoleId) {
		await interaction.reply({
			embeds: [errorEmbed("No member role is configured yet. An admin needs to run `/setup` first.")],
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	try {
		const role = interaction.guild.roles.cache.get(memberRoleId) ?? (await interaction.guild.roles.fetch(memberRoleId).catch(() => null));
		if (!role) {
			await interaction.reply({
				embeds: [errorEmbed("The configured member role no longer exists. An admin needs to re-run `/setup`.")],
				flags: MessageFlags.Ephemeral,
			});
			return;
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
		console.error(`[powerup] toggle member role failed in guild ${guildId}`, err);
		await interaction.reply({
			embeds: [
				errorEmbed(
					"Could not update your notifications. The bot may be missing Manage Roles, or the member role sits above the bot's own role. Try again in a moment."
				),
			],
			flags: MessageFlags.Ephemeral,
		});
	}
}

/**
 * Register the power-up button handler. Called once at boot from main.ts
 * alongside the other registerXHandlers, BEFORE the InteractionCreate listener.
 * Still required even though the buttons now live on the intro guides — every
 * `powerup:*` click routes through here.
 */
export function registerPowerUpHandlers(): void {
	registerButton(POWERUP_PREFIX, handlePowerUpButton);
}

// ── one-time migration: delete the old standalone control panels ──────────
// The controls used to live on separate pinned "power-up" panel messages; they
// are now buttons on the pinned intro guides. On boot we delete any leftover
// panel (whose id is tracked in GuildConfig.powerUpMessageIds) and clear the
// field. Idempotent: once every tracked id is null this is a no-op (one
// findByGuildId, no write). Safe to retire this sweep once every live guild has
// booted past it.
const PANEL_KEYS = [
	"commandsChannelId",
	"adminCommandsChannelId",
	"adminChannelId",
	"leaderboardChannelId",
	"introChannelId",
	"announcementsChannelId",
] as const;

/**
 * Delete every tracked control panel for one guild and clear powerUpMessageIds.
 * Best-effort per panel: a failed delete is logged and the rest proceed.
 */
async function removeGuildPowerUpPanels(client: Client, guild: Guild): Promise<void> {
	const config = await guildConfigStore.findByGuildId(guild.id);
	if (!config) return;

	const channelIds = config as unknown as Record<string, string | null | undefined>;
	const stored = (config.powerUpMessageIds ?? {}) as unknown as Record<string, string | null | undefined>;

	let changed = false;
	const cleared: Record<string, null> = {};
	for (const key of PANEL_KEYS) {
		cleared[key] = null;
		const panelId = stored[key];
		if (!panelId) continue;
		changed = true; // a tracked panel existed → delete it + clear the id

		const channelId = channelIds[key] ?? null;
		const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
		if (channel instanceof TextChannel) {
			const stale = await channel.messages.fetch(panelId).catch(() => null);
			if (stale) {
				try {
					await stale.delete();
				} catch (error) {
					console.warn(`[powerup] failed to delete legacy ${key} panel in guild ${guild.id}`, error);
				}
			}
		}
	}

	if (changed) await guildConfigStore.update(guild.id, { powerUpMessageIds: cleared });
}

/**
 * Boot-sweep entry point: delete the old standalone control panels for every
 * guild (the buttons now live on the intro guides). Per-guild failures are
 * logged and swallowed so one guild cannot stall the rest. Called from main.ts
 * where ensureAllPowerUps used to run.
 */
export async function removeAllPowerUpPanels(client: Client): Promise<void> {
	for (const guild of client.guilds.cache.values()) {
		await removeGuildPowerUpPanels(client, guild).catch((error) => console.error(`[powerup] panel cleanup failed for guild ${guild.id}`, error));
	}
}
