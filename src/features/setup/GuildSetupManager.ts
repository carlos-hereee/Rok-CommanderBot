import { Guild, PermissionFlagsBits, ChannelType, CategoryChannel, GuildChannel } from "discord.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { ISetupConfig, IAdminRoleConfig, ICreatedChannels, IChannelObjects } from "./setup.types.js";
import { ChannelContent } from "./ChannelContent.js";
import { embedContent } from "@base/constants/embed-content.js";

const { channels } = embedContent.setup;

export class GuildSetupManager {
	// ── Phase 1: auto-construct on join / restart ─────────────
	static async autoSetup(guild: Guild, config: ISetupConfig): Promise<void> {
		const existing = await guildConfigStore.findByGuildId(config.guildId);
		if (existing?.categoryId) return; // already constructed

		// owner-only category until admin role is assigned in Phase 2
		const category = await guild.channels.create({
			name: embedContent.setup.categoryName,
			type: ChannelType.GuildCategory,
			permissionOverwrites: [
				{
					id: guild.roles.everyone.id,
					deny: [PermissionFlagsBits.ViewChannel],
				},
				{
					id: config.ownerId,
					allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
				},
			],
		});

		const { ids, objects } = await GuildSetupManager.createChannels(guild, category, config);
		const { scheduleMessageId } = await GuildSetupManager.populateChannels(objects);

		await guildConfigStore.create({
			guildId: config.guildId,
			adminRoleId: null,
			memberRoleId: null,
			categoryId: category.id,
			introChannelId: ids.introChannelId,
			commandsChannelId: ids.commandsChannelId,
			leaderboardChannelId: ids.leaderboardChannelId,
			scheduleChannelId: ids.scheduleChannelId,
			announcementsChannelId: ids.announcementsChannelId,
			adminChannelId: ids.adminChannelId,
			// scheduleMessageId anchors the pinned schedule board that
			// ScheduleBoard.refreshSchedule keeps up to date. see
			// src/features/schedule/ScheduleBoard.ts for the lifecycle.
			scheduleMessageId,
			setupComplete: false,
		});
	}

	// ── Phase 2: apply admin role to existing channels ────────
	static async applyAdminRole(guild: Guild, config: IAdminRoleConfig): Promise<void> {
		const stored = await guildConfigStore.findByGuildId(config.guildId);
		if (!stored) throw new Error("No guild config found — channels have not been constructed yet.");

		const [category, introChannel, commandsChannel, leaderboardChannel, scheduleChannel, announcementsChannel, adminChannel] =
			(await Promise.all([
				guild.channels.fetch(stored.categoryId),
				guild.channels.fetch(stored.introChannelId),
				guild.channels.fetch(stored.commandsChannelId),
				guild.channels.fetch(stored.leaderboardChannelId),
				guild.channels.fetch(stored.scheduleChannelId),
				guild.channels.fetch(stored.announcementsChannelId),
				guild.channels.fetch(stored.adminChannelId),
			])) as (GuildChannel | null)[];

		// grant admin role access to category
		await category?.permissionOverwrites.create(config.adminRoleId, {
			ViewChannel: true,
			SendMessages: true,
			ReadMessageHistory: true,
		});

		// grant admin role send permissions on public channels
		for (const ch of [introChannel, commandsChannel, leaderboardChannel, scheduleChannel, announcementsChannel]) {
			await ch?.permissionOverwrites.create(config.adminRoleId, {
				ViewChannel: true,
				SendMessages: true,
			});
		}

		// grant admin role full access to admin channel
		await adminChannel?.permissionOverwrites.create(config.adminRoleId, {
			ViewChannel: true,
			SendMessages: true,
			ReadMessageHistory: true,
		});

		// post the real welcome message now that the role is known
		if (adminChannel?.isTextBased()) {
			await adminChannel.send({ embeds: [ChannelContent.adminWelcome(config.ownerId, config.adminRoleId)] });
		}

		await guildConfigStore.update(config.guildId, {
			adminRoleId: config.adminRoleId,
			memberRoleId: config.memberRoleId,
			setupComplete: true,
		});
	}

	// ── channel creation ──────────────────────────────────────
	private static async createChannels(
		guild: Guild,
		category: CategoryChannel,
		config: ISetupConfig
	): Promise<{ ids: ICreatedChannels; objects: IChannelObjects }> {
		// public channels — owner can send, everyone else read-only
		const publicOverwrites = [
			{
				id: guild.roles.everyone.id,
				allow: [PermissionFlagsBits.ViewChannel],
				deny: [PermissionFlagsBits.SendMessages],
			},
			{
				id: config.ownerId,
				allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
			},
		];

		// admin channel — owner only until Phase 2
		const adminOverwrites = [
			{
				id: guild.roles.everyone.id,
				deny: [PermissionFlagsBits.ViewChannel],
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

	// ── populate channels with initial content ────────────────
	// returns the scheduleMessageId so autoSetup can persist it. the schedule
	// channel is special: its message is the anchor for the live schedule
	// board that ScheduleBoard.refreshSchedule edits in place. pinning is
	// best effort — a missing pin does not break the feature.
	private static async populateChannels(discordChannels: IChannelObjects): Promise<{ scheduleMessageId: string }> {
		const { introChannel, commandsChannel, leaderboardChannel, scheduleChannel, announcementsChannel, adminChannel } =
			discordChannels;

		const [, , , scheduleMessage] = await Promise.all([
			introChannel.send({ embeds: [ChannelContent.introduction()] }),
			commandsChannel.send({ embeds: [ChannelContent.commandGuide()] }),
			leaderboardChannel.send({ embeds: [ChannelContent.leaderboardIntro()] }),
			scheduleChannel.send({ embeds: [ChannelContent.scheduleIntro()] }),
			announcementsChannel.send({ embeds: [ChannelContent.announcementsIntro()] }),
			adminChannel.send({ embeds: [ChannelContent.adminPending()] }),
		]);

		try {
			await scheduleMessage.pin();
		} catch (error) {
			// pin requires ManageMessages. if the bot's role lacks it the
			// board still works, the intro just floats in recent history.
			console.warn(`[setup] failed to pin schedule intro message for guild ${discordChannels.scheduleChannel.guildId}:`, error);
		}

		return { scheduleMessageId: scheduleMessage.id };
	}
}
