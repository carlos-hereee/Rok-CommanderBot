import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { eventStore } from "@db/stores/eventStore.js";
import { eventOverrideStore } from "@db/stores/eventOverrideStore.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { getUpcomingOccurrences } from "@features/events/occurrenceCalculator.js";
import type { IGameEvent } from "@features/events/event.types.js";
import { decreeEditCustomIds } from "./decreeEditHandlers.js";

// ── NextUpBoard ─────────────────────────────────────────────────────
// What:  posts a fresh embed for each upcoming decree in a guild's
//        configured nextDecreeChannelId. Posts are append-only — every
//        decree gets its own message so the channel doubles as an audit
//        trail of what was scheduled and (via the Edit button) which
//        decrees got modified.
// Who:   triggered by main.ts on bot startup (refreshAllNextUp) and by
//        ReminderScheduler after each fire (refreshNextUp). Read by
//        any warrior in the alliance who joins the channel.
// When:  the rolling 24-hour horizon means a decree gets posted as soon
//        as it enters the window. The dedup Set below makes sure each
//        (guild, event, occurrence) tuple is posted at most once per
//        bot process lifetime — a bot restart will re-post the next 24h
//        of decrees, which is the accepted trade-off (the channel is
//        append-only by design, so a small number of re-posts on restart
//        is preferable to introducing a persistent dedup table).
// Where: never edits an existing message. The schedule board (pinned
//        message in the schedule channel) is the place that mutates;
//        next-decree posts are immutable historical records.
// How:   per refresh: read events → compute upcoming-24h → look up
//        overrides → render embed (with Edit button) → send. Errors per
//        decree are logged and do not stop the loop.

const HORIZON_MS = 24 * 60 * 60 * 1000; // 24 hours

// Module-scoped dedup Set. Key shape: `${guildId}:${eventId}:${occurrenceMs}`.
// Written by tryPostDecree below. Lives in-process; no persistence.
const postedDecrees = new Set<string>();

function postedDecreeKey(guildId: string, eventId: string, occurrenceMs: number): string {
	return `${guildId}:${eventId}:${occurrenceMs}`;
}

// Exported for testing — lets tests reset module state between runs.
export function _resetNextUpDedupForTest(): void {
	postedDecrees.clear();
}

// ── public entry points ─────────────────────────────────────────────

export async function refreshAllNextUp(client: Client): Promise<void> {
	for (const [guildId] of client.guilds.cache) {
		await refreshNextUp(client, guildId).catch((error) => {
			// Per-guild failures must not stop the sweep. Log loud and move
			// on. The next refresh trigger (event create, reminder fire) will
			// retry naturally.
			console.error("[nextUp] guild refresh failed", { guildId }, error);
		});
	}
}

export async function refreshNextUp(client: Client, guildId: string): Promise<void> {
	const config = await guildConfigStore.findByGuildId(guildId);
	if (!config?.nextDecreeChannelId) {
		// Legacy guilds (those that ran /setup before nextDecreeChannelId
		// was added to the schema) load without the channel id. Silent
		// bail — autoSetup will provision the channel on the next run
		// without a re-/setup.
		return;
	}

	const channel = await client.channels.fetch(config.nextDecreeChannelId).catch(() => null);
	if (!channel || !(channel instanceof TextChannel)) {
		console.error("[nextUp] next-decree channel not resolvable", { guildId, channelId: config.nextDecreeChannelId });
		return;
	}

	const events = await eventStore.findByGuildId(guildId);
	const now = Date.now();
	const horizonEnd = now + HORIZON_MS;

	for (const eventLike of events) {
		const event = eventLike as unknown as IGameEvent;
		// Compute up to 5 upcoming occurrences and filter to the window.
		// 5 is comfortably above the maximum a 40-hour-cadence event
		// could produce in 24h (which is 1), and even a 4-hour cadence
		// caps at 6 — close enough that the constant is fine.
		const upcoming = getUpcomingOccurrences(event, 5);
		for (const occurrence of upcoming) {
			const occurrenceMs = occurrence.getTime();
			if (occurrenceMs <= now || occurrenceMs > horizonEnd) continue;

			const key = postedDecreeKey(guildId, event.eventId, occurrenceMs);
			if (postedDecrees.has(key)) continue;

			try {
				await tryPostDecree(channel, event, occurrence);
				postedDecrees.add(key);
			} catch (error) {
				console.error("[nextUp] post failed", { guildId, eventId: event.eventId, occurrenceMs }, error);
			}
		}
	}
}

// ── private ─────────────────────────────────────────────────────────

async function tryPostDecree(channel: TextChannel, event: IGameEvent, occurrence: Date): Promise<void> {
	// Merge overrides on top of the event payload before rendering so
	// the post reflects edits applied through the modal flow. Apply-once
	// overrides are keyed on the original occurrence; this lookup runs
	// per decree and per refresh, so a fresh override applied between
	// refreshes shows up as soon as the next refresh fires.
	const override = await eventOverrideStore.findOne({
		eventId: event.eventId,
		originalOccurrence: occurrence,
	});

	const renderedTitle = override?.overrideTitle ?? event.name;
	const renderedDescription = override?.overrideDescription ?? event.description ?? "";
	const renderedTime = override?.overrideTime ?? occurrence;
	const fireTs = Math.floor(renderedTime.getTime() / 1000);

	const embed = new EmbedBuilder()
		.setTitle(`📜 Upcoming decree: ${renderedTitle}`)
		.setDescription(renderedDescription || "_(no description)_")
		.addFields(
			{ name: "Fires", value: `<t:${fireTs}:F> · <t:${fireTs}:R>`, inline: false },
			...(event.prepSteps && event.prepSteps.length > 0
				? [
						{
							name: "Preparation",
							value: [...event.prepSteps]
								.sort((a, b) => a.order - b.order)
								.map((step, i) => `${i + 1}. ${step.label}`)
								.join("\n"),
							inline: false,
						},
				  ]
				: []),
			...(override
				? [
						{
							name: "✏️ Edited",
							value: "_This fire has been edited from its original schedule._",
							inline: false,
						},
				  ]
				: [])
		)
		.setFooter({ text: "Click Edit below to adjust this decree (admins only)." });

	// occurrence (not renderedTime) is the original anchor — that's the
	// key the modal handler uses when looking up + writing overrides, so
	// the customId must carry the ORIGINAL occurrence even when the
	// override has shifted the actual fire time.
	const occurrenceUnix = Math.floor(occurrence.getTime() / 1000);
	const button = new ButtonBuilder()
		.setCustomId(decreeEditCustomIds.buildEditButton(event.eventId, occurrenceUnix))
		.setLabel("Edit")
		.setStyle(ButtonStyle.Secondary)
		.setEmoji("✏️");

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

	await channel.send({ embeds: [embed], components: [row] });
}
