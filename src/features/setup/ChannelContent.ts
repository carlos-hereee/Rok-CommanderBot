import { EmbedBuilder } from "discord.js";
import { embedContent } from "@base/constants/embed-content.js";
import { infoEmbed } from "@utils/embedBuilder.js";

const cc = embedContent.channelContent;

export const ChannelContent = {
	introduction(): EmbedBuilder {
		return infoEmbed(cc.introduction.title, cc.introduction.description, embedContent.COLORS.INTRODUCTION);
	},

	commandGuide(): EmbedBuilder {
		return infoEmbed(cc.commandGuide.title, cc.commandGuide.description, embedContent.COLORS.COMMANDS).addFields(
			...cc.commandGuide.fields
		);
	},
	adminPending(): EmbedBuilder {
		return infoEmbed(cc.adminWelcome.title, embedContent.responses.adminRolePending, embedContent.COLORS.ADMIN);
	},
	scheduleIntro(): EmbedBuilder {
		return infoEmbed(cc.schedule.title, cc.schedule.description, embedContent.COLORS.SCHEDULE);
	},

	leaderboardIntro(): EmbedBuilder {
		return infoEmbed(cc.leaderboard.title, cc.leaderboard.description, embedContent.COLORS.LEADERBOARD);
	},

	announcementsIntro(): EmbedBuilder {
		return infoEmbed(cc.announcements.title, cc.announcements.description, embedContent.COLORS.ANNOUNCEMENTS);
	},

	// Pinned intro above the NextUpBoard posts. Tells mortals that this
	// channel grows over time on purpose (each upcoming event creates a
	// permanent post) so they stop asking why it is not being "cleaned up".
	nextDecreeIntro(): EmbedBuilder {
		return infoEmbed(cc.nextDecree.title, cc.nextDecree.description, embedContent.COLORS.NEXT_DECREE);
	},

	adminWelcome(ownerId: string, adminRoleId: string): EmbedBuilder {
		return infoEmbed(cc.adminWelcome.title, cc.adminWelcome.description(ownerId, adminRoleId), embedContent.COLORS.ADMIN);
	},

	// ── self heal notices ─────────────────────────────────────
	// posted to the inner sanctum from GuildSetupManager.ensureHomebase when
	// a wake up scan finds missing pieces of the homebase. per channel
	// notices fire for single channel restores; the castle rebuilt notice
	// fires once after a full category reconstruction. both use the ADMIN
	// color so they visually match the rest of the inner sanctum surface.
	channelRepairNotice(channelName: string): EmbedBuilder {
		return infoEmbed(
			cc.channelRepairNotice.title,
			cc.channelRepairNotice.description(channelName),
			embedContent.COLORS.ADMIN
		);
	},
	castleRebuiltNotice(): EmbedBuilder {
		return infoEmbed(cc.castleRebuiltNotice.title, cc.castleRebuiltNotice.description, embedContent.COLORS.ADMIN);
	},
};
