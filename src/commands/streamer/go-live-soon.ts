import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	PermissionFlagsBits,
	MessageFlags,
	TextChannel,
	EmbedBuilder,
} from "discord.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { embedContent } from "@base/constants/embed-content.js";
import { errorEmbed } from "@utils/embedBuilder.js";

// ── /go-live-soon ─────────────────────────────────────────────────────
// What:  one-shot panic-button announcement. Does NOT create an Event.
//        Posts directly to the guild's announcements channel with a
//        single embed pinging the configured role (or an override).
//        Lead-time choices map to fixed minute deltas so the embed can
//        render an honest "stream starts at <t:UNIX:t>" timestamp.
// Who:   streamers who forgot to pre-announce. Discord communities
//        notice when a streamer goes live without a heads-up; this is
//        the 30-second escape hatch that fixes that.
// When:  on demand, ad-hoc. No persistence — if the streamer wants
//        recurring reminders they should run /configure-stream-schedule.
//        Two /go-live-soon calls in a row will produce two separate
//        announcement messages on purpose: each one is a fresh "now-ish"
//        signal, not an edit of the previous.
// Where: posts to guildConfig.announcementsChannelId. Same channel that
//        ReminderJob and TestReminderJob target — the home base
//        announcements channel is the single source of truth for outward
//        bot communication.
// How:   ① resolve channel + lead time; ② compose embed; ③ send with
//        explicit allowedMentions limited to the chosen role (or
//        memberRoleId fallback). NEVER allowedMentions @everyone — even
//        though the panic-button vibe might tempt it, that surface area
//        is reserved for the real reminder pipeline which has a paper
//        trail.

const c = embedContent.goLiveSoon;

// Lead time choices. Keep this list closed and matched to the slash
// command option choices below so the parser is exhaustive (no string
// fallthrough). The label is what shows up in the embed body.
const LEAD_TIMES: Record<string, { minutes: number; label: string }> = {
	now: { minutes: 0, label: "now" },
	"10m": { minutes: 10, label: "in 10 minutes" },
	"30m": { minutes: 30, label: "in 30 minutes" },
	"1h": { minutes: 60, label: "in 1 hour" },
	"3h": { minutes: 180, label: "in 3 hours" },
	"6h": { minutes: 360, label: "in 6 hours" },
};

export const data = new SlashCommandBuilder()
	.setName("go-live-soon")
	.setDescription("Post a quick going-live announcement (one-shot, no recurring reminder)")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addStringOption((option) =>
		option
			.setName("when")
			.setDescription("When does the stream start?")
			.setRequired(true)
			.addChoices(
				{ name: "Now", value: "now" },
				{ name: "In 10 minutes", value: "10m" },
				{ name: "In 30 minutes", value: "30m" },
				{ name: "In 1 hour", value: "1h" },
				{ name: "In 3 hours", value: "3h" },
				{ name: "In 6 hours", value: "6h" }
			)
	)
	.addStringOption((option) =>
		option.setName("note").setDescription("Optional one-liner (game, what you're doing, etc)").setRequired(false).setMaxLength(500)
	)
	.addRoleOption((option) =>
		option
			.setName("mention-role")
			.setDescription("Role to ping for this announcement (defaults to the guild member role)")
			.setRequired(false)
	);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
	const guildId = interaction.guildId;
	if (!guildId) {
		await interaction.reply({ embeds: [errorEmbed("Run this in a server, not a DM.")], flags: MessageFlags.Ephemeral });
		return;
	}

	const config = await guildConfigStore.findByGuildId(guildId);
	if (!config?.announcementsChannelId) {
		await interaction.reply({ embeds: [errorEmbed(c.setupRequired)], flags: MessageFlags.Ephemeral });
		return;
	}

	const whenKey = interaction.options.getString("when", true);
	const lead = LEAD_TIMES[whenKey];
	if (!lead) {
		// Defensive: Discord constrains the choices already, but if a
		// future edit loosens the option this guard prevents an undefined
		// dereference below. The error string nudges the streamer to
		// re-pick from the list.
		await interaction.reply({ embeds: [errorEmbed(c.invalidLeadTime)], flags: MessageFlags.Ephemeral });
		return;
	}

	const note = interaction.options.getString("note", false)?.trim() || null;
	const mentionRole = interaction.options.getRole("mention-role", false);
	const roleId = mentionRole?.id ?? config.memberRoleId ?? null;

	// Compute the start timestamp. now + lead.minutes; even "now" gets
	// passed through Date.now() so the <t:UNIX:t> render is accurate
	// rather than rounding to whatever Discord's display tick is.
	const startUnix = Math.floor((Date.now() + lead.minutes * 60_000) / 1000);

	// ── resolve and validate the destination channel ──
	let channel;
	try {
		channel = await interaction.client.channels.fetch(config.announcementsChannelId);
	} catch (err) {
		console.error("[go-live-soon] channel fetch failed", err);
		await interaction.reply({ embeds: [errorEmbed(c.postFailed)], flags: MessageFlags.Ephemeral });
		return;
	}
	if (!channel || !(channel instanceof TextChannel)) {
		await interaction.reply({ embeds: [errorEmbed(c.postFailed)], flags: MessageFlags.Ephemeral });
		return;
	}

	// ── compose the embed ──
	// Title is fixed ("Going live soon") and body is the lead-time line
	// followed by the optional streamer note. Color reuses ANNOUNCEMENTS
	// so this announcement reads visually consistent with the recurring
	// reminders fired by ReminderJob.
	const embed = new EmbedBuilder()
		.setTitle(c.announcementTitle)
		.setDescription(c.announcementBody(lead.label, startUnix, note))
		.setColor(embedContent.COLORS.ANNOUNCEMENTS)
		.setFooter({ text: embedContent.FOOTER });

	const mention = roleId ? `<@&${roleId}>` : "@here";

	try {
		await channel.send({
			content: mention,
			embeds: [embed],
			// Explicitly whitelist only the role we named in `content`
			// (or fall through to parse:["everyone"] when there is no
			// configured role at all). Same allowedMentions discipline
			// as ReminderJob — never let a malformed note sneak an
			// @everyone past the guard.
			allowedMentions: roleId ? { roles: [roleId] } : { parse: ["everyone"] },
		});

		await interaction.reply({ content: c.posted, flags: MessageFlags.Ephemeral });
	} catch (err) {
		console.error("[go-live-soon] post failed", err);
		await interaction.reply({ embeds: [errorEmbed(c.postFailed)], flags: MessageFlags.Ephemeral });
	}
}
