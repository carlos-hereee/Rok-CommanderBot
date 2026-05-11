import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	PermissionFlagsBits,
	MessageFlags,
} from "discord.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { errorEmbed, infoEmbed } from "@utils/embedBuilder.js";
import { embedContent } from "@base/constants/embed-content.js";

// ── /configure-leaderboard-tracking ───────────────────────────────────
// What:  master switch for participation tracking. When ON (default),
//        ActivityTracker writes PlayerActivity rows on ✅ reactions and
//        voice-channel joins. When OFF, both listeners early-return so
//        no new rows are written. Existing rows stay; /leaderboard
//        continues to render historical data because the toggle is
//        about new tracking, not destruction.
// Who:   streamers who do not want participation tracked, or who want
//        to pause tracking during a hiatus without losing prior data.
//        Captured from 2026-05-11 streamer feedback.
// When:  on demand. Same idempotency contract as /configure-auto-heal —
//        no silent re-writes, explicit "already on / already off"
//        feedback on repeat invocations.
// Where: writes GuildConfig.leaderboardTrackingEnabled via
//        guildConfigStore.update. Read at runtime by ActivityTracker's
//        MessageReactionAdd and voiceStateUpdate handlers.
// How:   ① guildId gate; ② config existence gate; ③ idempotent write
//        with a clear note that historical data remains visible so the
//        admin does not panic about leaderboard accuracy after a flip.

export const data = new SlashCommandBuilder()
	.setName("configure-leaderboard-tracking")
	.setDescription("Toggle whether the bot records participation (reactions + voice joins)")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addBooleanOption((option) =>
		option
			.setName("enabled")
			.setDescription("True to keep tracking new participation, false to pause new writes")
			.setRequired(true)
	);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
	const guildId = interaction.guildId;
	if (!guildId) {
		await interaction.reply({
			embeds: [errorEmbed("Run this in a server, not a DM.")],
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const enabled = interaction.options.getBoolean("enabled", true);

	const config = await guildConfigStore.findByGuildId(guildId);
	if (!config) {
		await interaction.reply({
			embeds: [errorEmbed("This server has not been set up yet. Run /setup first.")],
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (config.leaderboardTrackingEnabled === enabled) {
		await interaction.reply({
			embeds: [
				infoEmbed(
					"Leaderboard tracking already that way",
					`Participation tracking is already ${enabled ? "ON" : "OFF"}. No change made.`,
					embedContent.COLORS.SCHEDULE
				),
			],
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	try {
		await guildConfigStore.update(guildId, { leaderboardTrackingEnabled: enabled });
		const heading = enabled ? "📊 Leaderboard tracking ON" : "⏸️ Leaderboard tracking OFF";
		const body = enabled
			? "The bot will record ✅ reactions and voice-channel joins as participation. This is the default behavior."
			: "The bot will no longer record new participation. Existing /leaderboard data stays visible — this toggle stops new writes, it does not delete history. Run this command again with `enabled:True` to resume tracking.";
		await interaction.reply({
			embeds: [infoEmbed(heading, body, embedContent.COLORS.SCHEDULE)],
			flags: MessageFlags.Ephemeral,
		});
	} catch (err) {
		console.error("[configure-leaderboard-tracking] update failed", err);
		await interaction.reply({
			embeds: [errorEmbed("Could not save the toggle. Try again or check the bot's logs.")],
			flags: MessageFlags.Ephemeral,
		});
	}
}
