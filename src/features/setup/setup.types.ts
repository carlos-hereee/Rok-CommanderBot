export interface ISetupConfig {
	guildId: string;
	adminRoleId: string;
	ownerId: string;
}

export interface ICreatedChannels {
	categoryId: string;
	introChannelId: string;
	commandsChannelId: string;
	leaderboardChannelId: string;
	scheduleChannelId: string;
	announcementsChannelId: string;
	adminChannelId: string;
}
