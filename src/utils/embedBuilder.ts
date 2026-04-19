import { EmbedBuilder, ColorResolvable } from "discord.js";
import { IGameEvent, IPrepStep } from "@features/events/event.types.js";
import { embedContent } from "@base/constants/embed-content.js";

interface IListEventField {
	name: string;
	type: "recurring" | "one-time";
	nextOccurrenceTs: number; // unix seconds
	intervalHours: number | null; // null for one-time
	seasonEndTs: number; // unix seconds
}

export function listEventsEmbed(fields: IListEventField[], announcementsChannelId: string | null = null): EmbedBuilder {
	const c = embedContent.listEvents;
	// the destination channel is the same for every event in the guild, so it
	// renders once in the embed description instead of being repeated per row.
	// an unset value (guild has not finished /setup) is treated as a soft warning.
	const description = announcementsChannelId ? c.postedToHeader(announcementsChannelId) : c.postedToHeaderUnset;
	const embed = base().setTitle(c.title).setDescription(description).setColor(embedContent.COLORS.SCHEDULE);

	for (const field of fields) {
		const lines: string[] = [];
		const occurrenceLabel = field.type === "recurring" ? c.nextOccurrenceLabel : c.scheduledDateLabel;

		lines.push(`**${occurrenceLabel}:** <t:${field.nextOccurrenceTs}:F>`);
		if (field.type === "recurring" && field.intervalHours !== null) {
			lines.push(c.intervalLabel(field.intervalHours));
		}
		lines.push(`**${c.seasonEndLabel}:** <t:${field.seasonEndTs}:D>`);

		embed.addFields({ name: c.fieldName(field.name, field.type), value: lines.join("\n"), inline: false });
	}

	return embed;
}

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
// ── test reminder embed ──
// dispatched from the admin dashboard as a drill.
// renders the same checklist + time fields as reminderEmbed so admins can
// verify prep step formatting end to end, but prefixes the title with [TEST]
// so Mortals instantly know it is not a real alert.
export function testReminderEmbed(event: IGameEvent, nextOccurrence: Date): EmbedBuilder {
	const c = embedContent.testReminder;
	return base()
		.setTitle(c.title(event.name))
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
				value: `<t:${Math.floor(nextOccurrence.getTime() / 1000)}:F>`,
			}
		);
}

// ── season end embed ──
export function seasonEndEmbed(): EmbedBuilder {
	const c = embedContent.seasonEnd;
	return base().setTitle(c.title).setDescription(c.description).setColor(embedContent.COLORS.SEASON_END);
}

// ── schedule board embed ──
// rendered into the pinned message in the event-schedule channel. three
// states: season ended, no events configured, or a roster of active events
// with one row per event. the caller resolves the events + the guild's
// announcements channel id so this function stays pure.
export interface IScheduleField {
	name: string;
	type: "recurring" | "one-time";
	// unix seconds. null when the event has no remaining future occurrences
	// (one-time event already in the past, but still active).
	nextOccurrenceTs: number | null;
	intervalHours: number | null;
	seasonEndTs: number;
}

export function scheduleBoardEmbed(
	fields: IScheduleField[],
	announcementsChannelId: string | null,
	options: { seasonEnded?: boolean } = {}
): EmbedBuilder {
	const c = embedContent.scheduleBoard;
	const embed = base().setTitle(c.title).setColor(embedContent.COLORS.SCHEDULE).setFooter({ text: c.footer });

	if (options.seasonEnded) {
		return embed.setDescription(c.seasonEnded).setColor(embedContent.COLORS.SEASON_END);
	}

	if (fields.length === 0) {
		return embed.setDescription(c.noEvents);
	}

	embed.setDescription(c.description(announcementsChannelId));

	for (const field of fields) {
		const lines: string[] = [];
		const occurrenceLabel = field.type === "recurring" ? c.nextOccurrenceLabel : c.scheduledDateLabel;

		if (field.nextOccurrenceTs !== null) {
			// both relative ("in 2 hours") and full date, so Mortals in any
			// timezone see a correct local time.
			lines.push(`**${occurrenceLabel}:** <t:${field.nextOccurrenceTs}:R> · <t:${field.nextOccurrenceTs}:f>`);
		} else {
			lines.push(`**${occurrenceLabel}:** _awaiting next season_`);
		}

		if (field.type === "recurring" && field.intervalHours !== null) {
			lines.push(c.intervalLabel(field.intervalHours));
		}

		lines.push(`**${c.seasonEndLabel}:** <t:${field.seasonEndTs}:D>`);

		embed.addFields({ name: c.fieldName(field.name, field.type), value: lines.join("\n"), inline: false });
	}

	return embed;
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
