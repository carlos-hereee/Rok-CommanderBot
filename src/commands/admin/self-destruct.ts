import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from "discord.js";
import { errorEmbed } from "@utils/embedBuilder.js";
import { showSelfDestructConfirm } from "@features/setup/selfDestruct.js";

// ── /self-destruct ─────────────────────────────────────────────────────
// Server-owner-only. Pops the Confirm/Cancel prompt that, on confirm, demolishes
// this server's bot homebase (category + all channels) and keeps it gone until
// /setup runs again. setDefaultMemberPermissions(Administrator) hides it from
// non-admins in the picker; showSelfDestructConfirm enforces the stricter
// server-owner-only gate (Discord has no "owner only" permission flag).
export const data = new SlashCommandBuilder()
	.setName("self-destruct")
	.setDescription("Server owner only: demolish this server's bot homebase (all channels)")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
	if (!interaction.guild) {
		await interaction.reply({ embeds: [errorEmbed("Run this in a server, not a DM.")], flags: MessageFlags.Ephemeral });
		return;
	}
	// showSelfDestructConfirm performs the owner check and replies with either the
	// confirm prompt or an ephemeral denial.
	await showSelfDestructConfirm(interaction);
}
