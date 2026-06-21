import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { rokCommanderCopy } from "@base/copy/packs/rok-commander.pack.js";
import { DERO_IMAGE_REF, buildDeroImageAttachment } from "@base/copy/brand.js";

// ── lead-time table ─────────────────────────────────────────────────
// Shared between /go-live-soon (slash command) and the Go Live Now
// button on the schedule channel's control message. Both surfaces map
// a key string to the same minutes / label pair, so an announcement
// fired from either path renders identically.
//
// If a future surface (modal, dashboard, etc) adds new lead times,
// add them here. The /go-live-soon slash command's option choices and
// the button's hardcoded `now` key both depend on the keys staying in
// sync with what is registered as a Discord option.
export const GO_LIVE_LEAD_TIMES: Record<string, { minutes: number; label: string }> = {
	now: { minutes: 0, label: "now" },
	"10m": { minutes: 10, label: "in 10 minutes" },
	"30m": { minutes: 30, label: "in 30 minutes" },
	"1h": { minutes: 60, label: "in 1 hour" },
	"3h": { minutes: 180, label: "in 3 hours" },
	"6h": { minutes: 360, label: "in 6 hours" },
};

// Result envelope. Callers ack the interaction with their own copy
// (slash command shows ephemeral confirmation; button can do the same
// or a follow-up message). The reason discriminator lets each caller
// pick the right error embed from the pack copy.
export type TGoLiveResult =
	| { ok: true }
	| { ok: false; reason: "setup-required" | "invalid-lead-time" | "post-failed" };

// Post a "going live soon" announcement to the guild's announcements
// channel. Shared execution path for /go-live-soon and the schedule
// channel control button.
//
// Why share: the announcement composition (embed shape, allowed
// mentions discipline, fallback role precedence) is identical across
// callers. Duplicating it risks drift; the /go-live-soon copy is the
// canonical wording and both surfaces should render the same message.
//
// Callers handle their own interaction acking. This helper only owns
// the channel send. Any failure returns a discriminated reason so the
// caller can pick the right error string from the pack.
export async function postGoLiveAnnouncement(
	client: Client,
	guildId: string,
	whenKey: string,
	note: string | null,
	mentionRoleIdOverride: string | null
): Promise<TGoLiveResult> {
	const config = await guildConfigStore.findByGuildId(guildId);
	if (!config?.announcementsChannelId) return { ok: false, reason: "setup-required" };

	const lead = GO_LIVE_LEAD_TIMES[whenKey];
	if (!lead) return { ok: false, reason: "invalid-lead-time" };

	// Role precedence: explicit override (slash command's mention-role
	// option) wins, then the guild's memberRoleId default, then null
	// (which the send block translates to @here). Mirrors the original
	// /go-live-soon behavior exactly so a button-fired announcement is
	// indistinguishable from a slash-command-fired one.
	const roleId = mentionRoleIdOverride ?? config.memberRoleId ?? null;

	// Compute start timestamp from now + lead minutes. Even "now" gets
	// passed through Date.now so the <t:UNIX:t> render is accurate
	// rather than rounding to Discord's display tick.
	const startUnix = Math.floor((Date.now() + lead.minutes * 60_000) / 1000);

	let channel;
	try {
		channel = await client.channels.fetch(config.announcementsChannelId);
	} catch (err) {
		console.error("[postGoLiveAnnouncement] channel fetch failed", err);
		return { ok: false, reason: "post-failed" };
	}
	if (!channel || !(channel instanceof TextChannel)) {
		return { ok: false, reason: "post-failed" };
	}

	const c = rokCommanderCopy.goLiveSoon;
	const embed = new EmbedBuilder()
		.setTitle(c.announcementTitle)
		.setDescription(c.announcementBody(lead.label, startUnix, note))
		.setColor(rokCommanderCopy.COLORS.ANNOUNCEMENTS)
		.setFooter({ text: rokCommanderCopy.FOOTER });

	// Large banner from the guild's default event image. Go-live is not tied to
	// a single event, so there is no per-event imageUrl here — the guild default
	// is the only source. Guard so null is a clean no-op (no image configured).
	const img = config.defaultEventImageUrl ?? null;
	if (img) embed.setImage(img);

	// Always give the embed a Dero thumbnail so a note-less "going live" never
	// reads as an empty text card (the original gripe). The bundled static PNG is
	// uploaded with the message (attachment://), so it renders without depending on
	// companyuno.com being deployed.
	embed.setThumbnail(DERO_IMAGE_REF);

	const mention = roleId ? `<@&${roleId}>` : "@here";

	try {
		await channel.send({
			content: mention,
			embeds: [embed],
			// The bundled Dero image, uploaded so the thumbnail attachment:// resolves.
			files: [buildDeroImageAttachment()],
			// Allowed-mentions discipline: only whitelist the role we
			// are explicitly pinging, or fall back to parse:["everyone"]
			// when there is no configured role. Never let a malformed
			// note sneak an @everyone past the guard. Same posture as
			// ReminderJob.
			allowedMentions: roleId ? { roles: [roleId] } : { parse: ["everyone"] },
		});
		return { ok: true };
	} catch (err) {
		console.error("[postGoLiveAnnouncement] post failed", err);
		return { ok: false, reason: "post-failed" };
	}
}
