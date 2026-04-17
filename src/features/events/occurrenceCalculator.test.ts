import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getUpcomingOccurrences, isEventWindowOpen } from "./occurrenceCalculator.js";
import { IGameEvent } from "./event.types.js";

// tiny factory so each test only spells out the fields it actually cares about.
// the rest default to a sensible recurring event anchored in 2026 so the math
// below is readable.
function makeEvent(overrides: Partial<IGameEvent> = {}): IGameEvent {
	return {
		eventId: "test-event",
		name: "Test Event",
		description: "",
		type: "recurring",
		intervalHours: 36,
		firstOccurrence: new Date("2026-04-01T12:00:00Z"),
		seasonEnd: new Date("2026-06-01T00:00:00Z"),
		reminderOffsets: [30, 15],
		guildId: "guild-1",
		prepSteps: [],
		active: true,
		...overrides,
	};
}

describe("getUpcomingOccurrences", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ── priority test #1 ───────────────────────────────────────────
	// pure math with a known anchor. if this is off the whole scheduler
	// walks off the rails.
	it("returns the next N recurring occurrences relative to a fixed now", () => {
		vi.setSystemTime(new Date("2026-04-17T00:00:00Z"));

		const event = makeEvent({
			intervalHours: 36,
			firstOccurrence: new Date("2026-04-01T12:00:00Z"),
		});

		const result = getUpcomingOccurrences(event, 3);

		// 372 hours elapsed from anchor to now, 10 intervals skipped, t lands on
		// Apr 16 12:00 which is still in the past → push starts at Apr 18 00:00.
		expect(result).toHaveLength(3);
		expect(result[0].toISOString()).toBe("2026-04-18T00:00:00.000Z");
		expect(result[1].toISOString()).toBe("2026-04-19T12:00:00.000Z");
		expect(result[2].toISOString()).toBe("2026-04-21T00:00:00.000Z");
	});

	// ── priority test #2 ───────────────────────────────────────────
	// empty array guard. a one-time event that already happened must not
	// generate a future occurrence or the scheduler will re-fire history.
	it("returns an empty array for a one-time event whose firstOccurrence is in the past", () => {
		vi.setSystemTime(new Date("2026-04-17T00:00:00Z"));

		const event = makeEvent({
			type: "one-time",
			intervalHours: 0,
			firstOccurrence: new Date("2026-04-10T12:00:00Z"),
		});

		expect(getUpcomingOccurrences(event, 1)).toEqual([]);
	});
});

describe("isEventWindowOpen", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ── priority test #3 ───────────────────────────────────────────
	// the activity tracker depends on this to decide whether a voice join
	// counts toward participation. has to return true when now is inside
	// the window that opens at the most recent occurrence.
	it("returns true when now is within the default 60 minute window after the most recent recurring occurrence", () => {
		// getUpcomingOccurrences uses Date.now() internally, so the system time
		// must match the `now` argument for the calculation to line up.
		vi.setSystemTime(new Date("2026-04-17T01:30:00Z"));

		const event = makeEvent({
			intervalHours: 24,
			firstOccurrence: new Date("2026-04-17T01:00:00Z"),
		});

		expect(isEventWindowOpen(event, new Date("2026-04-17T01:30:00Z"))).toBe(true);
	});
});
