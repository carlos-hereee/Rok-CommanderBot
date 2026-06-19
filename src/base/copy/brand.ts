import type { ColorResolvable } from "discord.js";

// ── shared brand identity ────────────────────────────────────────────────
// What:  the bot's visual + platform identity that does NOT vary by plugin
//        voice (kingdom vs neutral): the footer wordmark, the Dero embed
//        author, and the embed color palette. These were previously declared
//        verbatim inside every copy pack; lifting them here makes one source
//        of truth that each pack references, and gives non pack-aware call
//        sites (handlers with no guildConfig in scope, ops/observability
//        embeds) a place to import a color or footer WITHOUT pulling in a
//        whole voice pack.
// Who:   both copy packs spread these into their objects so getPluginCopy
//        (config).COLORS / .FOOTER / .AUTHOR keep working unchanged; color
//        and footer only consumers import the named exports directly.
// When:  read at module load (packs) and per render (consumers). Frozen for
//        the process lifetime — pure constants.
// Where: lives at @base/copy/brand, a sibling of the packs. Replaces the role
//        the legacy embed-content.ts shim played for these constants.

// Platform brand, not bot brand. Survives any pack-name changes and reinforces
// companyuno.com recognition across every embed the bot posts.
export const FOOTER = "Company Uno";

// Dero, the Company Uno mascot, is the bot's visual identity. Set as the embed
// author in embedBuilder.base() so every embed carries his name and icon.
// iconURL points at the PNG deployed with the web app (nexious-client/public/
// dero); Discord shows the name alone and skips a 404 icon gracefully, so this
// is safe to ship before that deploy lands. Same value across every pack — the
// bot presents as Dero regardless of voice.
export const AUTHOR = {
	name: "Dero",
	iconURL: "https://www.companyuno.com/dero/dero-icon-128.png",
};

// Embed color palette. Color is neutral by design — the kingdom vs streamer
// split happens in words, not in chrome — so the palette is identical across
// packs and lives here once. Keys map to embed types (reminder, schedule, etc).
export const COLORS = {
	REMINDER: "Red",
	SEASON_END: "DarkGrey",
	LEADERBOARD: "Gold",
	CONFIRMATION: "Yellow",
	ERROR: "DarkRed",
	ARRIVAL: "DarkGold",
	INTRODUCTION: "DarkGold",
	COMMANDS: "DarkBlue",
	SCHEDULE: "DarkGreen",
	ANNOUNCEMENTS: "DarkRed",
	ADMIN: "DarkPurple",
	// NextUpBoard posts + 🛡️next-decree channel intro. Navy Blue reads as
	// "shield" without colliding with SCHEDULE (DarkGreen) or ANNOUNCEMENTS
	// (DarkRed) in the sidebar.
	NEXT_DECREE: "DarkNavy",
	// Dero's brand-indigo accent (matches the web --main-brand-color).
	// Decision 11: the bot identity pairs the "Dero" author + icon with a
	// brand indigo bar. Available for Dero-led or default embeds; the
	// per-type colors above keep their meaning and are unchanged.
	DERO: "#4f46e5",
} satisfies Record<string, ColorResolvable>;
