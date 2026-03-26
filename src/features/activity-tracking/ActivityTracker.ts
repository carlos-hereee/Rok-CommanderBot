import { Client, Events, MessageReaction, User, VoiceState, PartialMessageReaction, PartialUser } from "discord.js";
import { reminderStore } from "@db/stores/reminderStore.js";
import { activityStore } from "@db/stores/activityStore.js";
import { eventStore } from "@db/stores/eventStore.js";
import { isEventWindowOpen } from "@features/events/occurrenceCalculator.js";
import { getUpcomingOccurrences } from "@features/events/occurrenceCalculator.js";
import { IVoiceSession } from "./activity.types.js";
import { computeScore } from "./ParticipationStore.js";

// in-memory map of active voice sessions
// key is userId, value is the session details
// this resets if the bot restarts — acceptable for a single server bot
const activeSessions = new Map<string, IVoiceSession>();

export function registerActivityListeners(client: Client): void {
	// ─────────────────────────────────────────
	// LISTENER 1 — Reaction tracking
	// fires when any user reacts to any message
	// ─────────────────────────────────────────

	client.on(
		Events.MessageReactionAdd,
		async (
			reaction: MessageReaction | PartialMessageReaction, // ← union type
			user: User | PartialUser // ← union type
		) => {
			try {
				if (user.bot) return;
				if (reaction.emoji.name !== "✅") return;

				// always fetch partials before accessing their properties
				// this is now necessary since reaction could be partial
				const fullReaction = reaction.partial ? await reaction.fetch() : reaction;

				const fullUser = user.partial ? await user.fetch() : user;

				const log = await reminderStore.findByMessageId(fullReaction.message.id);
				if (!log) return;

				await activityStore.upsert({
					eventId: log.eventId,
					eventOccurrence: log.eventOccurrence,
					userId: fullUser.id,
					username: fullUser.username,
					data: {
						acknowledgedReminder: true,
						acknowledgedAt: new Date(),
					},
				});

				await updateScore(log.eventId, log.eventOccurrence, fullUser.id);
			} catch (error) {
				console.error("Reaction tracking error:", error);
			}
		}
	);

	// ─────────────────────────────────────────
	// LISTENER 2 — Voice join/leave tracking
	// fires whenever any user's voice state changes
	// ─────────────────────────────────────────
	client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
		try {
			const member = newState.member ?? oldState.member;
			if (!member || member.user.bot) return;

			const userId = member.id;
			const username = member.user.username;

			const joined = !oldState.channelId && newState.channelId;
			const left = oldState.channelId && !newState.channelId;

			// ── player joined voice ──
			if (joined) {
				// check if any event window is currently open
				const activeEvent = await getActiveEvent();
				if (!activeEvent) return; // no event happening right now — don't track

				// cache session in memory
				activeSessions.set(userId, {
					userId,
					eventId: activeEvent.eventId,
					eventOccurrence: activeEvent.occurrence,
					joinedAt: Date.now(),
				});

				// mark that they joined — voiceMinutes updated when they leave
				await activityStore.upsert({
					eventId: activeEvent.eventId,
					eventOccurrence: activeEvent.occurrence,
					userId,
					username,
					data: { joinedVoiceDuring: true },
				});
			}

			// ── player left voice ──
			if (left) {
				const session = activeSessions.get(userId);
				if (!session) return; // they joined before bot started — no session data

				// calculate how long they were in VC
				const voiceMinutes = Math.floor((Date.now() - session.joinedAt) / 60_000);
				activeSessions.delete(userId);

				// get existing record to add to their running total
				// (they might have left and rejoined multiple times)
				const existing = await activityStore.findOne(session.eventId, session.eventOccurrence, userId);

				const totalMinutes = (existing?.voiceMinutes ?? 0) + voiceMinutes;

				await activityStore.upsert({
					eventId: session.eventId,
					eventOccurrence: session.eventOccurrence,
					userId,
					username,
					data: { voiceMinutes: totalMinutes },
				});

				await updateScore(session.eventId, session.eventOccurrence, userId);
			}
		} catch (error) {
			console.error("Voice tracking error:", error);
		}
	});

	// ─────────────────────────────────────────
	// LISTENER 3 — Presence tracking
	// fires when a user's online status changes
	// ─────────────────────────────────────────
	client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
		try {
			if (!newPresence.member || newPresence.member.user.bot) return;

			// only care about transitions TO online/idle/dnd FROM offline
			const wasOffline = !oldPresence || oldPresence.status === "offline";
			const isOnline = newPresence.status !== "offline";
			if (!wasOffline || !isOnline) return;

			// check if an event just started (within the first 10 minutes)
			const activeEvent = await getActiveEvent(10);
			if (!activeEvent) return;

			const userId = newPresence.member.id;
			const username = newPresence.member.user.username;

			await activityStore.upsert({
				eventId: activeEvent.eventId,
				eventOccurrence: activeEvent.occurrence,
				userId,
				username,
				data: { wasOnlineAtStart: true },
			});

			await updateScore(activeEvent.eventId, activeEvent.occurrence, userId);
		} catch (error) {
			console.error("Presence tracking error:", error);
		}
	});
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

// checks if any active event is currently in its window
// windowMinutes lets presence tracking use a tighter 10min window
async function getActiveEvent(windowMinutes = 60) {
	const events = await eventStore.findAll();

	for (const event of events) {
		if (!isEventWindowOpen(event, new Date(), windowMinutes)) continue;

		const [occurrence] = getUpcomingOccurrences(event, 1);

		// getUpcomingOccurrences returns the NEXT future occurrence
		// but we want the one that just started — so look back one interval
		const intervalMs = event.intervalHours * 60 * 60 * 1000;
		const lastOccurrence = new Date(occurrence.getTime() - intervalMs);

		return { ...event, occurrence: lastOccurrence };
	}

	return null;
}

// recomputes and saves participation score after any activity update
async function updateScore(eventId: string, eventOccurrence: Date, userId: string) {
	const record = await activityStore.findOne(eventId, eventOccurrence, userId);
	if (!record) return;

	const score = computeScore(record);
	await activityStore.upsert({
		eventId,
		eventOccurrence,
		userId,
		username: record.username,
		data: { participationScore: score },
	});
}
