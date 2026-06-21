import { AttachmentBuilder, type ColorResolvable } from "discord.js";
import { join } from "node:path";

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
// author in embedBuilder.base() so every embed carries his name and icon. The
// icon is a 128px PNG: Discord renders author icons as a single static frame, so
// the icon-sized PNG is the right asset here; the animated gif is used as the
// introductions embed image instead (see DERO_GIF_URL). Same value across every
// pack — the bot presents as Dero regardless of voice.
//
// DEPLOY NOTE: these assets live in nexious-client/public/dero and only render
// once the web app is deployed with them. Until then companyuno.com/dero/* 200s
// with the SPA's HTML (not the file), so Discord shows the name with no image.
export const AUTHOR = {
	name: "Dero",
	iconURL: "https://www.companyuno.com/dero/dero-icon-128.png",
};

// Animated Dero (default state) for the introductions embed image (setImage), so
// new members see the mascot in action. Same deploy requirement as AUTHOR.iconURL.
export const DERO_GIF_URL = "https://www.companyuno.com/dero/dero-default.gif";

// ── bundled Dero image (static) ──────────────────────────────────────────
// A still PNG shipped in the bot's assets/ dir (so it deploys WITH the bot on
// Railway), attached to messages via Discord's attachment:// reference. Used as
// the going-live thumbnail + the invite-card image. This avoids depending on
// companyuno.com serving /dero — the gif URL above 404s to the SPA's HTML until
// that web app ships. The ~2.8 MB animated gifs are too heavy to upload on every
// message; this 85 KB still is not. Swap the file (or point back at DERO_GIF_URL)
// to upgrade the art later.
export const DERO_IMAGE_FILE = "dero-avatar-512.png";
export const DERO_IMAGE_REF = `attachment://${DERO_IMAGE_FILE}`;

// Build the upload for the bundled image. process.cwd() is the bot's project root
// (Railway start + nodemon both run from there), so assets/dero/<file> resolves
// whether running from src or the compiled dist.
export function buildDeroImageAttachment(): AttachmentBuilder {
	return new AttachmentBuilder(join(process.cwd(), "assets", "dero", DERO_IMAGE_FILE), { name: DERO_IMAGE_FILE });
}

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
