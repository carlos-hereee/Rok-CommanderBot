import { IGameEvent } from "./event.types.js";

// pure function — no DB calls, no Discord, just math
// this makes it trivially easy to unit test
export function getUpcomingOccurrences(event: IGameEvent, count: number): Date[] {
	const occurrences: Date[] = [];
	const intervalMs = event.intervalHours * 60 * 60 * 1000;
	const now = Date.now();

	// start from the anchor point and walk forward
	// until we've collected enough future occurrences
	let t = new Date(event.firstOccurrence).getTime();

	// skip past occurrences efficiently instead of looping one by one
	if (t < now) {
		const elapsed = now - t;
		const intervalsPassed = Math.floor(elapsed / intervalMs);
		t += intervalsPassed * intervalMs;
	}

	// collect the next `count` occurrences
	while (occurrences.length < count) {
		if (t > now) occurrences.push(new Date(t));
		t += intervalMs;
	}

	return occurrences;
}

// separate helper used by ActivityTracker to know if an
// event window is currently open (for voice/presence tracking)
export function isEventWindowOpen(event: IGameEvent, now = new Date(), windowMinutes = 60): boolean {
	const occurrences = getUpcomingOccurrences(event, 1);
	if (!occurrences.length) return false;

	const nextOccurrence = occurrences[0];

	// look backwards — was the most recent occurrence within the last EVENT_WINDOW_MINUTES?
	const intervalMs = event.intervalHours * 60 * 60 * 1000;
	const lastOccurrence = new Date(nextOccurrence.getTime() - intervalMs);
	const windowEnd = new Date(
		lastOccurrence.getTime() + windowMinutes * 60 * 1000 // windowMinutes window after start
	);

	return now >= lastOccurrence && now <= windowEnd;
}
