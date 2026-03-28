import { EmbedBuilder, ColorResolvable } from "discord.js";
import { IGameEvent, IPrepStep } from "@features/events/event.types.js";
import { embedContent } from "@base/constants/embed-content.js";

// ── private ───────────────────────────────────────────────────
function base(): EmbedBuilder {
	return new EmbedBuilder().setTimestamp().setFooter({ text: embedContent.FOOTER });
}

// ── public ────────────────────────────────────────────────────
export function reminderEmbed(event: IGameEvent, occurrence: Date, offsetMinutes: number): EmbedBuilder {
	const c = embedContent.reminder;
	return base()
		.setTitle(c.title(event.name, offsetMinutes))
		.setDescription(c.description)
		.setColor(embedContent.COLORS.REMINDER)
		.addFields(
			{
				name: c.checklistField,
				value: (event.prepSteps as IPrepStep[])
					.sort((a, b) => a.order - b.order)
					.map((step, i) => `${i + 1}. ${step.label}`)
					.join("\n"),
			},
			{
				name: c.timeField,
				value: `<t:${Math.floor(occurrence.getTime() / 1000)}:F>`,
			}
		);
}
// ── season end embed ──
export function seasonEndEmbed(): EmbedBuilder {
	const c = embedContent.seasonEnd;
	return base().setTitle(c.title).setDescription(c.description).setColor(embedContent.COLORS.SEASON_END);
}
// ── confirmation embed ──
export function leaderboardEmbed(
	eventName: string,
	ranked: {
		username: string;
		totalScore: number;
		eventsAttended: number;
		totalAcknowledged: number;
	}[]
): EmbedBuilder {
	const c = embedContent.leaderboard;
	return base()
		.setTitle(c.title(eventName))
		.setColor(embedContent.COLORS.LEADERBOARD)
		.setDescription(
			ranked
				.map((p, i) => c.row(c.medals[i] ?? `**${i + 1}.**`, p.username, p.totalScore, p.eventsAttended, p.totalAcknowledged))
				.join("\n\n")
		)
		.setFooter({ text: c.footer });
}
// ── KvK configuration confirmation embed ──
export function kvkConfirmationEmbed(dates: {
	seasonEnd: Date;
	ruinsFirst: Date;
	altarFirst: Date;
	kauEasy: Date;
	kauNormal: Date;
	kauHard: Date;
	kauNightmare: Date;
	channelId: string;
}): EmbedBuilder {
	const c = embedContent.kvkConfirmation;
	const t = (date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:F>`;

	return base()
		.setTitle(c.title)
		.setDescription(c.description)
		.setColor(embedContent.COLORS.CONFIRMATION)
		.addFields(
			{
				name: c.fields.seasonEnd,
				value: `<t:${Math.floor(dates.seasonEnd.getTime() / 1000)}:D>`,
				inline: false,
			},
			{
				name: c.fields.ruins.name,
				value: [`First occurrence: ${t(dates.ruinsFirst)}`, c.fields.ruins.interval].join("\n"),
				inline: false,
			},
			{
				name: c.fields.altar.name,
				value: [`First occurrence: ${t(dates.altarFirst)}`, c.fields.altar.interval].join("\n"),
				inline: false,
			},
			{
				name: c.fields.kau.name,
				value: [
					`Easy:      ${t(dates.kauEasy)}`,
					`Normal:    ${t(dates.kauNormal)}  *(+14 days)*`,
					`Hard:      ${t(dates.kauHard)}  *(+17 days)*`,
					`Nightmare: ${t(dates.kauNightmare)}  *(+6 days)*`,
				].join("\n"),
				inline: false,
			},
			{
				name: c.fields.channel,
				value: `<#${dates.channelId}>`,
				inline: false,
			}
		);
}

export function errorEmbed(message: string): EmbedBuilder {
	return base().setTitle(embedContent.error.title).setDescription(message).setColor(embedContent.COLORS.ERROR);
}

export function infoEmbed(title: string, description: string, color: ColorResolvable = "Blurple"): EmbedBuilder {
	return base().setTitle(title).setDescription(description).setColor(color);
}

export function arrivalEmbed(guildName: string, ownerId: string): EmbedBuilder {
	const c = embedContent.arrival;
	return base().setTitle(c.title).setDescription(c.description(guildName, ownerId)).setColor(embedContent.COLORS.ARRIVAL);
}
