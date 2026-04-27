import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getUpcomingOccurrences, isEventWindowOpen } from "./occurrenceCalculator.js";
import { IGameEvent } from "./event.types.js";
import rokEvents from "../../base/constants/rok-events.json" with { type: "json" };

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

// ── rok-events.json cadence regression ────────────────────────────────
// What:  pins the canonical real-game cadences for each ROK event so a
//        future edit to rok-events.json that drifts these values gets
//        caught at test time instead of in production.
// Who:   anyone editing rok-events.json. The JSON is consumed by
//        GuildEventManager.configureKvKSeason which writes intervalHours
//        onto every Event document at create time. Wrong cadence here
//        means every guild's reminders walk earlier than the real game by
//        the difference, accumulating per cycle. Spotted in the wild on
//        2026-04-26 when Ruins (was 36) fired hours early; real cadence
//        is 40. Altar (was 84) was off by 2 per cycle; real cadence 86.
// When:  on every test run. The expected values are the source of truth
//        the canonical ROK community schedule shows for current seasons.
// Where: the screenshot fixture below mirrors three rows from the
//        community schedule for Ancient Ruins anchored at the canonical
//        Wed 2026-03-18 12:00 UTC anchor. If the real game cadence ever
//        changes (game patch), update rok-events.json AND this fixture
//        in the same commit so the test still passes against reality.
describe("rok-events.json cadence", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("Ancient Ruins is configured at 40 hours (real game cadence)", () => {
		const ruins = rokEvents.events.find((e) => e.key === "ruins");
		expect(ruins).toBeDefined();
		expect(ruins!.intervalHours).toBe(40);
	});

	it("Altar of Darkness is configured at 86 hours (real game cadence)", () => {
		const altar = rokEvents.events.find((e) => e.key === "altar_of_darkness");
		expect(altar).toBeDefined();
		expect(altar!.intervalHours).toBe(86);
	});

	it("Kau Karuak difficulties stay at 0-hour interval (one-time events)", () => {
		const kauKeys = ["kau_karuak_easy", "kau_karuak_normal", "kau_karuak_hard", "kau_karuak_nightmare"];
		for (const key of kauKeys) {
			const event = rokEvents.events.find((e) => e.key === key);
			expect(event, `missing ${key} in rok-events.json`).toBeDefined();
			expect(event!.intervalHours).toBe(0);
		}
	});

	it("getUpcomingOccurrences with the configured Ruins cadence reproduces the canonical schedule", () => {
		// What:  end-to-end check that JSON cadence + occurrenceCalculator
		//        yield the same dates the canonical ROK community schedule
		//        shows. If either side drifts this test fails.
		// Where: anchor and expected dates pulled from the community
		//        schedule screenshot the bug report attached on 2026-04-26.
		// How:   pin a now() that's BEFORE the anchor so getUpcomingOccurrences
		//        walks from firstOccurrence forward without skipping past
		//        anything. This isolates the cadence math from the
		//        skip-past-now branch.
		vi.setSystemTime(new Date("2026-03-18T11:00:00Z"));

		const ruinsEvent = makeEvent({
			intervalHours: rokEvents.events.find((e) => e.key === "ruins")!.intervalHours,
			firstOccurrence: new Date("2026-03-18T12:00:00Z"),
		});

		const result = getUpcomingOccurrences(ruinsEvent, 4);

		// Canonical schedule rows: Wed 18.3 12:00, Fri 20.3 04:00,
		// Sat 21.3 20:00, Mon 23.3 12:00. Each successive entry is exactly
		// 40 hours after the previous one.
		expect(result[0].toISOString()).toBe("2026-03-18T12:00:00.000Z");
		expect(result[1].toISOString()).toBe("2026-03-20T04:00:00.000Z");
		expect(result[2].toISOString()).toBe("2026-03-21T20:00:00.000Z");
		expect(result[3].toISOString()).toBe("2026-03-23T12:00:00.000Z");
	});

	it("getUpcomingOccurrences with the configured Altar cadence reproduces the canonical schedule", () => {
		vi.setSystemTime(new Date("2026-04-03T11:00:00Z"));

		const altarEvent = makeEvent({
			intervalHours: rokEvents.events.find((e) => e.key === "altar_of_darkness")!.intervalHours,
			firstOccurrence: new Date("2026-04-03T12:00:00Z"),
		});

		const result = getUpcomingOccurrences(altarEvent, 4);

		// Canonical schedule rows: Fri 3.4 12:00, Tue 7.4 02:00,
		// Fri 10.4 16:00, Tue 14.4 06:00. Each entry is exactly 86 hours
		// after the previous one.
		expect(result[0].toISOString()).toBe("2026-04-03T12:00:00.000Z");
		expect(result[1].toISOString()).toBe("2026-04-07T02:00:00.000Z");
		expect(result[2].toISOString()).toBe("2026-04-10T16:00:00.000Z");
		expect(result[3].toISOString()).toBe("2026-04-14T06:00:00.000Z");
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
