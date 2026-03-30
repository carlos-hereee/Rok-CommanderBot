import { Guild, PermissionFlagsBits, ChannelType, CategoryChannel } from "discord.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { ISetupConfig, ICreatedChannels, IChannelObjects } from "./setup.types.js";
import { ChannelContent } from "./ChannelContent.js";
import { embedContent } from "@base/constants/embed-content.js";

const { channels } = embedContent.setup;

export class GuildSetupManager {
	static async setup(guild: Guild, config: ISetupConfig): Promise<void> {
		// ── check if already set up ───────────────────────────
		const existing = await guildConfigStore.findByGuildId(config.guildId);
		if (existing?.setupComplete) return;

		// ── create the category ───────────────────────────────
		// hidden from @everyone by default
		// only visible to owner and admin role
		const category = await guild.channels.create({
			name: embedContent.setup.categoryName,
			type: ChannelType.GuildCategory,
			permissionOverwrites: [
				{
					// deny everyone by default
					id: guild.roles.everyone.id,
					deny: [PermissionFlagsBits.ViewChannel],
				},
				{
					// grant admin role full access
					id: config.adminRoleId,
					allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
				},
				{
					// grant server owner full access
					id: config.ownerId,
					allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
				},
			],
		});

		// ── create channels + populate in one pass ────────────
		// ids go to the DB, objects go straight to populateChannels
		// no need to re-fetch channels we just created
		const { ids, objects } = await GuildSetupManager.createChannels(guild, category, config);
		await GuildSetupManager.populateChannels(objects, config);

		// ── save config to DB ─────────────────────────────────
		await guildConfigStore.create({
			guildId: config.guildId,
			adminRoleId: config.adminRoleId,
			categoryId: category.id,
			introChannelId: ids.introChannelId,
			commandsChannelId: ids.commandsChannelId,
			leaderboardChannelId: ids.leaderboardChannelId,
			scheduleChannelId: ids.scheduleChannelId,
			announcementsChannelId: ids.announcementsChannelId,
			adminChannelId: ids.adminChannelId,
			setupComplete: true,
		});
	}

	// ── channel creation ──────────────────────────────────────
	private static async createChannels(
		guild: Guild,
		category: CategoryChannel,
		config: ISetupConfig
	): Promise<{ ids: ICreatedChannels; objects: IChannelObjects }> {
		// public channels — visible to everyone
		const publicOverwrites = [
			{
				id: guild.roles.everyone.id,
				allow: [PermissionFlagsBits.ViewChannel],
				deny: [PermissionFlagsBits.SendMessages], // read only for regular members
			},
			{
				id: config.adminRoleId,
				allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
			},
		];

		// admin only channel — completely hidden from everyone else
		const adminOverwrites = [
			{
				id: guild.roles.everyone.id,
				deny: [PermissionFlagsBits.ViewChannel], // completely invisible
			},
			{
				id: config.adminRoleId,
				allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
			},
			{
				id: config.ownerId,
				allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
			},
		];

		const [introChannel, commandsChannel, leaderboardChannel, scheduleChannel, announcementsChannel, adminChannel] =
			await Promise.all([
				guild.channels.create({
					name: channels.intro,
					type: ChannelType.GuildText,
					parent: category.id,
					permissionOverwrites: publicOverwrites,
				}),
				guild.channels.create({
					name: channels.commands,
					type: ChannelType.GuildText,
					parent: category.id,
					permissionOverwrites: publicOverwrites,
				}),
				guild.channels.create({
					name: channels.leaderboard,
					type: ChannelType.GuildText,
					parent: category.id,
					permissionOverwrites: publicOverwrites,
				}),
				guild.channels.create({
					name: channels.schedule,
					type: ChannelType.GuildText,
					parent: category.id,
					permissionOverwrites: publicOverwrites,
				}),
				guild.channels.create({
					name: channels.announcements,
					type: ChannelType.GuildText,
					parent: category.id,
					permissionOverwrites: publicOverwrites,
				}),
				guild.channels.create({
					name: channels.admin,
					type: ChannelType.GuildText,
					parent: category.id,
					permissionOverwrites: adminOverwrites,
				}),
			]);

		return {
			ids: {
				categoryId: category.id,
				introChannelId: introChannel.id,
				commandsChannelId: commandsChannel.id,
				leaderboardChannelId: leaderboardChannel.id,
				scheduleChannelId: scheduleChannel.id,
				announcementsChannelId: announcementsChannel.id,
				adminChannelId: adminChannel.id,
			},
			objects: {
				introChannel,
				commandsChannel,
				leaderboardChannel,
				scheduleChannel,
				announcementsChannel,
				adminChannel,
			},
		};
	}

	// ── populate channels with intro content ──────────────────
	// receives channel objects directly — no fetch needed
	private static async populateChannels(discordChannels: IChannelObjects, config: ISetupConfig): Promise<void> {
		const { introChannel, commandsChannel, leaderboardChannel, scheduleChannel, announcementsChannel, adminChannel } =
			discordChannels;

		// post intro content — all in parallel
		await Promise.all([
			introChannel.send({ embeds: [ChannelContent.introduction()] }),
			commandsChannel.send({ embeds: [ChannelContent.commandGuide()] }),
			leaderboardChannel.send({ embeds: [ChannelContent.leaderboardIntro()] }),
			scheduleChannel.send({ embeds: [ChannelContent.scheduleIntro()] }),
			announcementsChannel.send({ embeds: [ChannelContent.announcementsIntro()] }),
			adminChannel.send({ embeds: [ChannelContent.adminWelcome(config.ownerId, config.adminRoleId)] }),
		]);
	}
}
