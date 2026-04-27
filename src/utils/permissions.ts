import type { GuildMember } from "discord.js";

// ── permissions ─────────────────────────────────────────────────────
// Centralized authorization helpers. Today only the decree-edit flow
// reads from here; future features (transfer-bot-ownership, dangerous
// admin actions) should add their helpers alongside canEditDecree so
// every authorization decision lives in one file.
//
// Why a helper instead of inlining the check at the call site: persistent
// button interactions (the Edit button on NextUpBoard posts) cannot rely
// on Discord's built-in setDefaultMemberPermissions slash-command gate —
// that only filters the command picker. The component handler must
// re-verify the actor on every interaction, and that re-verification
// must match the gate the slash command would have applied.

interface IGuildConfigPermissionShape {
	adminRoleId?: string | null;
}

/**
 * canEditDecree
 *
 * What:  decides whether a Discord member is allowed to mutate an event
 *        through the decree-edit UI (apply once or apply permanent).
 *        Mirrors the slash-command admin gate in main.ts so a member who
 *        could run /list-events / /delete-event can also click Edit on a
 *        NextUpBoard post.
 * Who:   read by the persistent button + modal handlers in the decree-edit
 *        flow. Returns true on the happy path; the caller replies with an
 *        ephemeral denial when false.
 * When:  evaluated on every button click and every modal submit. The
 *        permission check is NOT cached — a role removal on Discord
 *        propagates to the next interaction immediately.
 * How:   server owner always passes. Admin-role match falls back to
 *        guild-level role cache, which discord.js refreshes on
 *        GUILD_MEMBER_UPDATE. If the guild has no adminRoleId set
 *        (legacy config), only the server owner is authorized.
 */
export function canEditDecree(member: GuildMember, config: IGuildConfigPermissionShape): boolean {
	if (member.id === member.guild.ownerId) return true;
	if (config.adminRoleId && member.roles.cache.has(config.adminRoleId)) return true;
	return false;
}
