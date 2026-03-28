import { Guild, PermissionFlagsBits, ChannelType, TextChannel, CategoryChannel } from "discord.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { ISetupConfig, ICreatedChannels } from "./setup.types.js";
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

		// ── create channels ───────────────────────────────────
		const setUpChannels = await GuildSetupManager.createChannels(guild, category, config);

		// ── post intro content in each channel ────────────────
		await GuildSetupManager.populateChannels(guild, setUpChannels, config);

		// ── save config to DB ─────────────────────────────────
		await guildConfigStore.create({
			guildId: config.guildId,
			adminRoleId: config.adminRoleId,
			categoryId: category.id,
			introChannelId: setUpChannels.introChannelId,
			commandsChannelId: setUpChannels.commandsChannelId,
			leaderboardChannelId: setUpChannels.leaderboardChannelId,
			scheduleChannelId: setUpChannels.scheduleChannelId,
			announcementsChannelId: setUpChannels.announcementsChannelId,
			adminChannelId: setUpChannels.adminChannelId,
			setupComplete: true,
		});
	}

	// ── channel creation ──────────────────────────────────────
	private static async createChannels(guild: Guild, category: CategoryChannel, config: ISetupConfig): Promise<ICreatedChannels> {
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
			categoryId: category.id,
			introChannelId: introChannel.id,
			commandsChannelId: commandsChannel.id,
			leaderboardChannelId: leaderboardChannel.id,
			scheduleChannelId: scheduleChannel.id,
			announcementsChannelId: announcementsChannel.id,
			adminChannelId: adminChannel.id,
		};
	}

	// ── populate channels with intro content ──────────────────
	private static async populateChannels(guild: Guild, populatedChannels: ICreatedChannels, config: ISetupConfig): Promise<void> {
		const fetch = (id: string) => guild.channels.fetch(id) as Promise<TextChannel>;

		const [introChannel, commandsChannel, leaderboardChannel, scheduleChannel, announcementsChannel, adminChannel] =
			await Promise.all([
				fetch(populatedChannels.introChannelId),
				fetch(populatedChannels.commandsChannelId),
				fetch(populatedChannels.leaderboardChannelId),
				fetch(populatedChannels.scheduleChannelId),
				fetch(populatedChannels.announcementsChannelId),
				fetch(populatedChannels.adminChannelId),
			]);

		// post intro content — all in parallel
		await Promise.all([
			introChannel.send({ embeds: [ChannelContent.introduction()] }),
			commandsChannel.send({ embeds: [ChannelContent.commandGuide()] }),
			leaderboardChannel.send({ embeds: [ChannelContent.leaderboardIntro()] }),
			scheduleChannel.send({ embeds: [ChannelContent.scheduleIntro()] }),
			announcementsChannel.send({ embeds: [ChannelContent.announcementsIntro()] }),
			adminChannel.send({
				embeds: [ChannelContent.adminWelcome(config.ownerId, config.adminRoleId)],
			}),
		]);
	}
}
