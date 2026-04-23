import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	PermissionFlagsBits,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	MessageFlags,
	EmbedBuilder,
} from "discord.js";
import { eventStore } from "@db/stores/eventStore.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { embedContent } from "@base/constants/embed-content.js";
import { errorEmbed } from "@utils/embedBuilder.js";
import { refreshSchedule } from "@features/schedule/ScheduleBoard.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";

// ── /configure-stream-schedule ────────────────────────────────────────
// What:  creates a recurring weekly event on a fixed day + time of week.
//        Every 168 hours from the first occurrence, the bot fires a
//        reminder in the guild's announcements channel pinging an
//        optional role override (defaults to the guild member role).
// Who:   streamers (or anyone running a weekly recurring stream / call).
//        Sibling to /configure-kvk-season — same primitive, simpler
//        input surface because the cadence is fixed at "weekly".
// When:  the streamer runs this once per recurring schedule. Re-running
//        with the same name short circuits with a "use /pause-schedule"
//        hint so two schedules never collide on a guild.
// Where: persists into the same Event collection as KvK events. Every
//        downstream system (ReminderScheduler, ScheduleBoard, Test
//        Reminder, /event-list) reads it without code changes — that
//        was the whole point of letting the data layer stay generic.
// How:   ① validate day + time; ② compute the next occurrence in UTC
//        from the day-of-week + time-of-day; ③ confirmation embed; ④
//        on confirm, eventStore.create with type:"recurring",
//        intervalHours:168, mentionRoleId:roleId, paused:false; ⑤ kick
//        a schedule board refresh.

const c = embedContent.streamSchedule;

// Day-of-week parsing. Accept full names; the option already constrains
// the choice list so this is a defensive map (case-insensitive in case
// the option ever loosens to a free string).
const DAY_TO_INDEX: Record<string, number> = {
	sunday: 0,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
};

const DAY_LABEL: Record<number, string> = {
	0: "Sunday",
	1: "Monday",
	2: "Tuesday",
	3: "Wednesday",
	4: "Thursday",
	5: "Friday",
	6: "Saturday",
};

/**
 * Parse a 24h "HH:MM" string into { hour, minute } or return null when
 * malformed. Permissive about leading zeros so "9:00" works as well as
 * "09:00", but rejects out-of-range values so 25:00 never lands in the
 * scheduler.
 */
function parseTimeOfDay(raw: string): { hour: number; minute: number } | null {
	const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
	if (hour < 0 || hour > 23) return null;
	if (minute < 0 || minute > 59) return null;
	return { hour, minute };
}

/**
 * Compute the next UTC date that matches a given day-of-week + time-of-day.
 * If today is the target day and the time is still in the future, returns
 * today. Otherwise returns the next matching weekday. This is intentionally
 * UTC-based: the schedule cadence is a wall-clock weekly rhythm and
 * Discord's <t:UNIX:F> renders each viewer's local time, so anchoring in
 * UTC keeps the math simple and deterministic across timezones.
 */
function nextOccurrenceUtc(targetDayIndex: number, hour: number, minute: number, now: Date = new Date()): Date {
	const candidate = new Date(now);
	candidate.setUTCHours(hour, minute, 0, 0);

	const todayDow = candidate.getUTCDay();
	let dayDelta = (targetDayIndex - todayDow + 7) % 7;

	// If the candidate is the target day but the time has already passed,
	// roll forward a full week. Without this guard, a streamer running the
	// command at 3pm UTC for "Sunday 9am" would schedule the very next
	// stream in the past — ReminderScheduler would skip it and the next
	// fire would not happen until the following Sunday anyway, but the
	// schedule board would render a confusing "in the past" timestamp.
	if (dayDelta === 0 && candidate.getTime() <= now.getTime()) {
		dayDelta = 7;
	}

	candidate.setUTCDate(candidate.getUTCDate() + dayDelta);
	return candidate;
}

export const data = new SlashCommandBuilder()
	.setName("configure-stream-schedule")
	.setDescription("Set up a weekly stream / event reminder on a fixed day and time")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addStringOption((option) =>
		option.setName("name").setDescription("Short label for this schedule (e.g. Friday Night Stream)").setRequired(true).setMaxLength(80)
	)
	.addStringOption((option) =>
		option
			.setName("day")
			.setDescription("Day of the week the stream happens")
			.setRequired(true)
			.addChoices(
				{ name: "Sunday", value: "sunday" },
				{ name: "Monday", value: "monday" },
				{ name: "Tuesday", value: "tuesday" },
				{ name: "Wednesday", value: "wednesday" },
				{ name: "Thursday", value: "thursday" },
				{ name: "Friday", value: "friday" },
				{ name: "Saturday", value: "saturday" }
			)
	)
	.addStringOption((option) =>
		option.setName("time-utc").setDescription("Start time in UTC, 24h format (e.g. 19:30)").setRequired(true)
	)
	.addRoleOption((option) =>
		option
			.setName("mention-role")
			.setDescription("Role to ping when reminders fire (defaults to the guild member role)")
			.setRequired(false)
	)
	.addStringOption((option) =>
		option
			.setName("description")
			.setDescription("Optional one-liner shown in the reminder embed")
			.setRequired(false)
			.setMaxLength(500)
	);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
	const guildId = interaction.guildId;
	if (!guildId) {
		// Slash commands inside DMs have no guild — this command only ever
		// makes sense inside a server. Discord's own permissioning blocks
		// most of this path but the explicit guard keeps the rest of the
		// function free of "what if guildId is null" branches.
		await interaction.reply({ embeds: [errorEmbed("Run this in a server, not a DM.")], flags: MessageFlags.Ephemeral });
		return;
	}

	// ── ① resolve channel + validate inputs ─────────────────────────
	// Same precondition as every other event-creating command: the guild
	// must have completed /setup so we know where reminders post. We also
	// look up GuildConfig to surface the fallback role in the confirmation
	// preview ("Pinging the guild member role").
	const config = await guildConfigStore.findByGuildId(guildId);
	if (!config?.announcementsChannelId) {
		await interaction.reply({ embeds: [errorEmbed(c.setupRequired)], flags: MessageFlags.Ephemeral });
		return;
	}

	const name = interaction.options.getString("name", true).trim();
	const dayRaw = interaction.options.getString("day", true).toLowerCase();
	const timeRaw = interaction.options.getString("time-utc", true);
	const mentionRole = interaction.options.getRole("mention-role", false);
	const description = interaction.options.getString("description", false)?.trim() ?? "";

	const dayIndex = DAY_TO_INDEX[dayRaw];
	if (dayIndex === undefined) {
		await interaction.reply({ embeds: [errorEmbed(c.invalidDay)], flags: MessageFlags.Ephemeral });
		return;
	}

	const time = parseTimeOfDay(timeRaw);
	if (!time) {
		await interaction.reply({ embeds: [errorEmbed(c.invalidTime)], flags: MessageFlags.Ephemeral });
		return;
	}

	// Duplicate-name guard. Active events only — a soft-deleted event with
	// the same name is allowed to be re-created (the streamer probably
	// retired the old schedule on purpose). Comparison is case-insensitive
	// so "Friday Night Stream" and "friday night stream" do not coexist.
	const existing = await eventStore.findByGuildId(guildId);
	if (existing.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
		await interaction.reply({ embeds: [errorEmbed(c.alreadyExists(name))], flags: MessageFlags.Ephemeral });
		return;
	}

	// ── ② compute next occurrence ──────────────────────────────────
	const firstOccurrence = nextOccurrenceUtc(dayIndex, time.hour, time.minute);
	const firstOccurrenceUnix = Math.floor(firstOccurrence.getTime() / 1000);
	const mentionRoleId = mentionRole?.id ?? null;

	// ── ③ confirmation embed ───────────────────────────────────────
	// Two-line preview: cadence + next fire, plus the audience line so
	// the streamer sees the role + channel before clicking save. Using
	// MessageFlags.Ephemeral so the preview does not clutter the channel
	// where the command was run.
	const previewLines = [
		c.confirm.description(name, DAY_LABEL[dayIndex], firstOccurrenceUnix),
		"",
		c.confirm.audienceLine(mentionRoleId ?? config.memberRoleId ?? null, config.announcementsChannelId),
	];

	const confirmEmbed = new EmbedBuilder()
		.setTitle(c.confirm.title)
		.setDescription(previewLines.join("\n"))
		.setColor(embedContent.COLORS.SCHEDULE);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("stream_confirm").setLabel(c.confirm.confirmButtonLabel).setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId("stream_cancel").setLabel(c.confirm.cancelButtonLabel).setStyle(ButtonStyle.Secondary)
	);

	const confirmMessage = await interaction.reply({
		embeds: [confirmEmbed],
		components: [row],
		flags: MessageFlags.Ephemeral,
	});

	// ── ④ wait for confirm / cancel ─────────────────────────────────
	try {
		const press = await confirmMessage.awaitMessageComponent({
			componentType: ComponentType.Button,
			time: 120_000,
			// Defensive filter: only the streamer who ran the command can
			// resolve their own ephemeral. Discord scopes this already since
			// the message is ephemeral, but the explicit user check is cheap
			// insurance.
			filter: (i) => i.user.id === interaction.user.id,
		});

		if (press.customId === "stream_cancel") {
			await press.update({ embeds: [errorEmbed(c.cancelled)], components: [] });
			return;
		}

		// confirmed — persist
		try {
			await eventStore.create({
				name,
				description,
				type: "recurring",
				intervalHours: 168, // weekly
				firstOccurrence,
				guildId,
				prepSteps: [],
				active: true,
				mentionRoleId,
				paused: false,
				// seasonEnd intentionally omitted — streamer schedules have
				// no season scope. Schema default is null, ScheduleBoard +
				// ReminderScheduler treat null as "no auto archive".
			});

			await press.update({
				embeds: [new EmbedBuilder().setDescription(c.saved(name)).setColor(embedContent.COLORS.SCHEDULE)],
				components: [],
			});

			// Fire and forget — schedule board refresh failure must not
			// undo the successful save. Same pattern as the events route.
			refreshSchedule(interaction.client, guildId).catch((err) =>
				console.error(LOG_MESSAGES.schedule.refreshAfterRouteFailed("/configure-stream-schedule"), err)
			);
		} catch (err) {
			console.error("[configure-stream-schedule] save failed", err);
			await press.update({ embeds: [errorEmbed(c.saveFailed)], components: [] });
		}
	} catch {
		// awaitMessageComponent rejects on timeout. Editing the original
		// reply (instead of replying again) keeps the audit trail tidy:
		// the streamer sees one ephemeral message that walked through
		// preview → timed out.
		await interaction.editReply({ embeds: [errorEmbed(c.timedOut)], components: [] });
	}
}
