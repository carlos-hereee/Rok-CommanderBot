import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { GuildSetupManager } from "@features/setup/GuildSetupManager.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { embedContent } from "@base/constants/embed-content.js";
import { errorEmbed, infoEmbed } from "@utils/embedBuilder.js";

const { responses } = embedContent;

export const data = new SlashCommandBuilder()
	.setName("setup")
	.setDescription("Construct 🔱 BY DIVINE DECREE and initialize the bot")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addRoleOption((option) =>
		option.setName("admin-role").setDescription("The role that will have access to bot configuration").setRequired(true)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	// ── owner only ────────────────────────────────────────────
	if (interaction.user.id !== interaction.guild?.ownerId) {
		await interaction.reply({ embeds: [errorEmbed(responses.ownerOnly)], ephemeral: true });
		return;
	}

	// ── check if already set up ───────────────────────────────
	const alreadySetup = await guildConfigStore.isSetupComplete(interaction.guildId!);

	if (alreadySetup) {
		await interaction.reply({ embeds: [errorEmbed(responses.alreadySetup)], ephemeral: true });
		return;
	}

	const adminRole = interaction.options.getRole("admin-role", true);
	await interaction.reply({
		embeds: [infoEmbed(responses.setupPending.title, responses.setupPending.description, embedContent.COLORS.ARRIVAL)],
		ephemeral: true,
	});
	try {
		await GuildSetupManager.setup(interaction.guild!, {
			guildId: interaction.guildId!,
			adminRoleId: adminRole.id,
			ownerId: interaction.guild!.ownerId,
		});

		await interaction.editReply({
			embeds: [
				infoEmbed(
					responses.setupSuccess(adminRole.id).title,
					responses.setupSuccess(adminRole.id).description,
					embedContent.COLORS.ARRIVAL
				),
			],
		});
	} catch (error) {
		console.error("Setup failed:", error);
		await interaction.editReply({ embeds: [errorEmbed(responses.setupFailed)] });
	}
}
