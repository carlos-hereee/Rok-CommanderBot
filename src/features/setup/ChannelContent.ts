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

	adminWelcome(ownerId: string, adminRoleId: string): EmbedBuilder {
		return infoEmbed(cc.adminWelcome.title, cc.adminWelcome.description(ownerId, adminRoleId), embedContent.COLORS.ADMIN);
	},
};
