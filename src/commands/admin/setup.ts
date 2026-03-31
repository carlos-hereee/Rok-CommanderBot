import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { GuildSetupManager } from "@features/setup/GuildSetupManager.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { embedContent } from "@base/constants/embed-content.js";
import { errorEmbed, infoEmbed } from "@utils/embedBuilder.js";

const { responses } = embedContent;

export const data = new SlashCommandBuilder()
	.setName("setup")
	.setDescription("Assign roles to configure the bot")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addRoleOption((option) =>
		option.setName("admin-role").setDescription("The role that will have access to bot configuration").setRequired(true)
	)
	.addRoleOption((option) =>
		option.setName("member-role").setDescription("The role assigned to verified members").setRequired(false)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	// ── owner only ────────────────────────────────────────────
	if (interaction.user.id !== interaction.guild?.ownerId) {
		await interaction.reply({ embeds: [errorEmbed(responses.ownerOnly)], ephemeral: true });
		return;
	}

	const config = await guildConfigStore.findByGuildId(interaction.guildId!);

	// channels haven't been built yet
	if (!config?.categoryId) {
		await interaction.reply({
			embeds: [errorEmbed("Channels not yet constructed. Please wait a moment and try again.")],
			ephemeral: true,
		});
		return;
	}

	// already fully set up
	if (config.setupComplete) {
		await interaction.reply({ embeds: [errorEmbed(responses.alreadySetup)], ephemeral: true });
		return;
	}

	const adminRole = interaction.options.getRole("admin-role", true);
	const memberRole = interaction.options.getRole("member-role");

	await interaction.reply({
		embeds: [infoEmbed(responses.setupPending.title, responses.setupPending.description, embedContent.COLORS.ARRIVAL)],
		ephemeral: true,
	});

	try {
		await GuildSetupManager.applyAdminRole(interaction.guild!, {
			guildId: interaction.guildId!,
			ownerId: interaction.guild!.ownerId,
			adminRoleId: adminRole.id,
			memberRoleId: memberRole?.id ?? null,
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
