import { describe, it, expect, afterEach, vi } from "vitest";
import { thisWeekRange, weekBoundaryTitle } from "./leaderboardWindow.js";

// thisWeekRange builds its boundaries with the LOCAL-time Date constructor
// (new Date(year, month, date, ...)), so every assertion here reads back local
// components (getDay/getDate/getHours). Pinning "now" with the same local
// constructor keeps the suite correct regardless of the runner's timezone.

describe("weekBoundaryTitle", () => {
	it("labels a Sunday-anchored week Sun to Sat", () => {
		expect(weekBoundaryTitle("sunday")).toBe("This week (Sun to Sat)");
	});

	it("labels a Monday-anchored week Mon to Sun", () => {
		expect(weekBoundaryTitle("monday")).toBe("This week (Mon to Sun)");
	});
});

describe("thisWeekRange", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	function pinNow(local: Date): void {
		vi.useFakeTimers();
		vi.setSystemTime(local);
	}

	// 2026-06-17 is a Wednesday (month index 5 = June). A mid-week anchor proves
	// the function reaches BACK to the start of the week in both modes.
	it("Sunday anchor from a Wednesday spans that week's Sunday 00:00 to Saturday 23:59:59.999", () => {
		pinNow(new Date(2026, 5, 17, 14, 30, 0, 0));
		const { from, to } = thisWeekRange("sunday");

		expect(from.getDay()).toBe(0); // Sunday
		expect(from.getDate()).toBe(14); // 2026-06-14
		expect([from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds()]).toEqual([0, 0, 0, 0]);

		expect(to.getDay()).toBe(6); // Saturday
		expect(to.getDate()).toBe(20); // 2026-06-20
		expect([to.getHours(), to.getMinutes(), to.getSeconds(), to.getMilliseconds()]).toEqual([23, 59, 59, 999]);

		// the pinned "now" must fall inside the window
		const now = new Date(2026, 5, 17, 14, 30, 0, 0).getTime();
		expect(from.getTime()).toBeLessThanOrEqual(now);
		expect(to.getTime()).toBeGreaterThanOrEqual(now);
	});

	it("Monday anchor from a Wednesday spans that week's Monday 00:00 to Sunday 23:59:59.999", () => {
		pinNow(new Date(2026, 5, 17, 14, 30, 0, 0));
		const { from, to } = thisWeekRange("monday");

		expect(from.getDay()).toBe(1); // Monday
		expect(from.getDate()).toBe(15); // 2026-06-15
		expect([from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds()]).toEqual([0, 0, 0, 0]);

		expect(to.getDay()).toBe(0); // Sunday
		expect(to.getDate()).toBe(21); // 2026-06-21
		expect([to.getHours(), to.getMinutes(), to.getSeconds(), to.getMilliseconds()]).toEqual([23, 59, 59, 999]);
	});

	// Boundary cases: the anchor day itself, and the day that reaches furthest
	// back. 2026-06-21 is a Sunday.
	it("Sunday anchor on a Sunday keeps that same Sunday as the start", () => {
		pinNow(new Date(2026, 5, 21, 9, 0, 0, 0));
		const { from } = thisWeekRange("sunday");
		expect(from.getDate()).toBe(21);
		expect(from.getDay()).toBe(0);
	});

	it("Monday anchor on a Sunday reaches back to the previous Monday", () => {
		pinNow(new Date(2026, 5, 21, 9, 0, 0, 0));
		const { from, to } = thisWeekRange("monday");
		expect(from.getDate()).toBe(15); // previous Monday
		expect(from.getDay()).toBe(1);
		expect(to.getDate()).toBe(21); // Sunday is the LAST day of a Monday-anchored week
		expect(to.getDay()).toBe(0);
	});
});
