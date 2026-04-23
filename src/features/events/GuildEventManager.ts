import { ChatInputCommandInteraction } from "discord.js";
import { BOT_CONSTANTS } from "@base/constants/BOT_CONSTANTS.js";
import { eventStore } from "@db/stores/eventStore.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import rokEvents from "@base/constants/rok-events.json" with { type: "json" };
import { v4 } from "uuid";
import { embedContent } from "@base/constants/embed-content.js";
import { refreshSchedule } from "@features/schedule/ScheduleBoard.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";

interface IKvKSeasonInput {
	seasonEnd: Date;
	ruinsFirst: Date;
	altarFirst: Date;
	kauEasy: Date;
	kauNormal: Date;
	kauHard: Date;
	kauNightmare: Date;
	// NOTE: channelId intentionally removed. source of truth is
	// guildConfig.announcementsChannelId, resolved at fire time by ReminderJob.

	// What:  optional admin-authored preparation checklist that overrides the
	//        per-event-type defaults baked into rok-events.json.
	// Who:   /configure-kvk-season command, populated only when the admin
	//        picks "Customize" in the post confirmation button flow.
	// When:  undefined means "use each event type's default prepSteps from
	//        rok-events.json." A non-empty array means "apply this exact list
	//        (in order) to every event created in this season call."
	// Where: applied at eventStore.create time below. Events store their own
	//        prepSteps copy so the list rendered in reminders never drifts
	//        with a config change mid season.
	// How:   raw strings from the modal. We wrap each into the IPrepStep
	//        shape ({ id, label, order }) at persist time. Empty string
	//        items are filtered upstream by the command; this contract
	//        assumes the caller has already sanitized.
	customChecklist?: readonly string[];
}

export class GuildEventManager {
	static async configureKvKSeason(interaction: ChatInputCommandInteraction, input: IKvKSeasonInput): Promise<void> {
		try {
			const guildId = interaction.guildId!;

			// read the announcements channel once for the reply footer. the
			// event rows themselves do not store a channelId anymore — that
			// would freeze the channel into stale data if the admin later
			// reconfigures the home base. ReminderJob reads GuildConfig fresh
			// every tick.
			const config = await guildConfigStore.findByGuildId(guildId);
			const announcementsChannelId = config?.announcementsChannelId ?? "";

			// ── persist the canonical KvK season end ──────────────────
			// What:  write input.seasonEnd to GuildConfig.kvkSeasonEnd so the
			//        dashboard can derive it when an admin opts new events into
			//        KvK mode. Single source of truth per guild.
			// Who:   read by the events route (POST /api/events) when
			//        announcementType is "kvk", and by the health endpoint that
			//        the EventCreatePage hits to enable / disable the KvK
			//        toggle.
			// When:  every /configure-kvk-season invocation overwrites this so
			//        rerunning the slash command rolls the season forward in a
			//        single transaction with the new event rows below.
			// Where: GuildConfig is created during /setup (autoSetup), so the
			//        update path here always finds an existing row. If config
			//        is missing we still proceed with event creation — the
			//        rest of the slash command was already tolerant of that
			//        edge — but log it so the field gap is visible.
			// How:   fire and forget at this point would race with the dashboard
			//        reading the value moments later. Awaiting the update keeps
			//        the slash command response and the cached value in lock
			//        step.
			if (config) {
				await guildConfigStore.update(guildId, { kvkSeasonEnd: input.seasonEnd });
			} else {
				console.warn(LOG_MESSAGES.guildEvent.configureKvkNoConfig(guildId));
			}

			// ── checklist resolution ──────────────────────────────
			// What:  pick the prepSteps list applied to every event created in
			//        this call. Admin chose "Customize" → use their typed list.
			//        Admin chose "Accept defaults" (or skipped) → fall back to
			//        each event type's per-type defaults from rok-events.json.
			// Who:   all eventStore.create calls below.
			// Where: the per-event-type defaults live in rok-events.json and
			//        remain authoritative for event shape (name, interval).
			//        Only prepSteps is overridden when customChecklist is set.
			// How:   resolvePrepSteps is a local helper (below) that returns
			//        the canonical [{ id, label, order }] shape either way.
			const resolvePrepSteps = (perTypeDefault: { prepSteps: Array<{ label: string; order: number }> }) => {
				if (input.customChecklist && input.customChecklist.length > 0) {
					// preserve admin's exact ordering. order is 1 based so the
					// rendered list in embedBuilder reads "1. … 2. …".
					return input.customChecklist.map((label, index) => ({
						id: v4(),
						label,
						order: index + 1,
					}));
				}
				return perTypeDefault.prepSteps.map((step) => ({ ...step, id: v4() }));
			};

			// ── recurring events ─────────────────────────────────
			const recurringEvents = [
				{ key: "ruins", firstOccurrence: input.ruinsFirst },
				{ key: "altar_of_darkness", firstOccurrence: input.altarFirst },
			];

			for (const { key, firstOccurrence } of recurringEvents) {
				const config = rokEvents.events.find((e) => e.key === key)!;

				await eventStore.create({
					name: config.name,
					description: "",
					type: "recurring",
					intervalHours: config.intervalHours,
					firstOccurrence,
					seasonEnd: input.seasonEnd,
					reminderOffsets: [...BOT_CONSTANTS.DEFAULT_REMINDER_OFFSETS],
					// channelId intentionally omitted — falls back to
					// guildConfig.announcementsChannelId at fire time
					guildId,
					prepSteps: resolvePrepSteps(config),
					active: true,
				});
			}

			// ── kau karuak one-time events ────────────────────────
			const kauOccurrences = [
				{ key: "kau_karuak_easy", date: input.kauEasy },
				{ key: "kau_karuak_normal", date: input.kauNormal },
				{ key: "kau_karuak_hard", date: input.kauHard },
				{ key: "kau_karuak_nightmare", date: input.kauNightmare },
			];

			for (const { key, date } of kauOccurrences) {
				const config = rokEvents.events.find((e) => e.key === key)!;

				await eventStore.create({
					name: config.name,
					description: "",
					type: "one-time",
					intervalHours: 0,
					firstOccurrence: date,
					seasonEnd: input.seasonEnd,
					reminderOffsets: [...BOT_CONSTANTS.DEFAULT_REMINDER_OFFSETS],
					// channelId intentionally omitted — see note above
					guildId,
					prepSteps: resolvePrepSteps(config),
					active: true,
				});
			}

			await interaction.editReply({
				content: embedContent.responses.kvkConfigured(
					Math.floor(input.seasonEnd.getTime() / 1000),
					announcementsChannelId
				),
			});

			// refresh the pinned schedule board now that events exist. fire
			// and forget — the admin's reply has already gone out and the
			// schedule is eventually consistent via the hourly safety tick.
			refreshSchedule(interaction.client, guildId).catch((err) =>
				console.error(LOG_MESSAGES.schedule.refreshAfterConfigureFailed, err)
			);
		} catch (error) {
			console.error(LOG_MESSAGES.guildEvent.configureKvkFailed, error);
			await interaction.editReply({
				content: embedContent.responses.kvkConfigureFailed,
			});
		}
	}
}
