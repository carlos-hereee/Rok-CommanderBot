import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { embedContent } from "@base/constants/embed-content.js";
import { infoEmbed } from "@utils/embedBuilder.js";
import { BOT_CONSTANTS } from "@base/constants/BOT_CONSTANTS.js";

const cc = embedContent.channelContent;

export const ChannelContent = {
	introduction(): EmbedBuilder {
		return infoEmbed(cc.introduction.title, cc.introduction.description, embedContent.COLORS.INTRODUCTION);
	},

	// ── introduction invite button row ──────────────────────────────
	// What:  link button row that sits beneath the introduction embed.
	//        Opens Discord's OAuth consent screen for inviting ROK
	//        Commander into another server. Link buttons do NOT require
	//        an interaction handler — Discord opens the URL directly.
	// Who:   outsiders who wander into the introductions channel and want
	//        to run the bot in their own guild. Existing mortals will
	//        mostly ignore the button; it is aimed at growth, not at
	//        current members.
	// When:  posted alongside the introduction embed on /setup, and re
	//        attached during refreshIntroEmbeds on every boot so copy /
	//        permission revisions land without a manual rebuild.
	// Where: paired with ChannelContent.introduction() in
	//        GuildSetupManager.populateChannels. The edit path in
	//        refreshIntroEmbeds must pass this row alongside embeds or
	//        the button gets silently dropped on boot (Discord clears
	//        components on edit unless explicitly preserved).
	// How:   single ButtonBuilder, ButtonStyle.Link, URL pulled from
	//        BOT_CONSTANTS so the client id + permissions are authored
	//        in one place and audited together with the permissions
	//        breakdown comment. Label is in the godly voice — the button
	//        is essentially a CTA written by the bot itself.
	introductionComponents(): ActionRowBuilder<ButtonBuilder> {
		return new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setLabel("Summon me to your server, Mortal")
				.setStyle(ButtonStyle.Link)
				.setURL(BOT_CONSTANTS.INVITE_URL)
				.setEmoji("🔱")
		);
	},

	commandGuide(): EmbedBuilder {
		return infoEmbed(cc.commandGuide.title, cc.commandGuide.description, embedContent.COLORS.COMMANDS).addFields(
			...cc.commandGuide.fields
		);
	},

	// ── admin command guide ──────────────────────────────────────
	// Posted as a SECOND pinned message inside #inner-sanctum, in
	// addition to adminWelcome. Tracked on
	// GuildConfig.introMessageIds.adminCommandGuideId so
	// refreshIntroEmbeds edits it in place on boot when copy or the
	// command list evolves. ADMIN color matches the rest of the inner
	// sanctum surface so visual identity stays consistent with the
	// welcome embed above it.
	adminCommandGuide(): EmbedBuilder {
		return infoEmbed(cc.adminCommandGuide.title, cc.adminCommandGuide.description, embedContent.COLORS.ADMIN).addFields(
			...cc.adminCommandGuide.fields
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
