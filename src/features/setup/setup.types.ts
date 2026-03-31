import type { TextChannel } from "discord.js";

export interface ISetupConfig {
	guildId: string;
	ownerId: string;
}

export interface IAdminRoleConfig {
	guildId: string;
	ownerId: string;
	adminRoleId: string;
	memberRoleId: string | null;
}

// shape of IDs saved to the database after setup
export interface ICreatedChannels {
	categoryId: string;
	introChannelId: string;
	commandsChannelId: string;
	leaderboardChannelId: string;
	scheduleChannelId: string;
	announcementsChannelId: string;
	adminChannelId: string;
}

// live channel objects returned from createChannels
// passed directly to populateChannels so we don't re-fetch from Discord
export interface IChannelObjects {
	introChannel: TextChannel;
	commandsChannel: TextChannel;
	leaderboardChannel: TextChannel;
	scheduleChannel: TextChannel;
	announcementsChannel: TextChannel;
	adminChannel: TextChannel;
}
