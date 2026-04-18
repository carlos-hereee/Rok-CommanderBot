import type { TextChannel } from "discord.js";

export interface ISetupConfig {
	guildId: string;
	ownerId: string;
}

export interface IAdminRoleConfig {
	guildId: string;
	ownerId: string;
	adminRoleId: string;
	// required as of the April 2026 update. the member role is pinged on every
	// event reminder so it must be set before reminders can fire cleanly.
	// GuildConfigModel still allows null at the schema layer to keep legacy
	// pre-update rows readable, but every new /setup run must supply this.
	memberRoleId: string;
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

// return shape of GuildSetupManager.ensureHomebase. the ready sweep in main.ts
// reads action to decide whether to send the owner the first-time arrival DM:
//   • "built"   — no prior GuildConfig existed, a fresh homebase was just
//                 constructed. DM the owner, log INTRO_DM_SENT.
//   • "rebuilt" — a stale GuildConfig was cleared and replaced. The owner was
//                 already introduced at the original join so skip the DM to
//                 avoid re spamming them on every rotation / env swap.
//   • "skipped" — the stored homebase exists and is owned by this bot. no op.
export interface IEnsureHomebaseResult {
	action: "built" | "rebuilt" | "skipped";
}
