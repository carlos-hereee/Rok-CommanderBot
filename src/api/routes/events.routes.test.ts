import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type { Client } from "discord.js";

// mock the eventStore BEFORE the router is imported. vitest hoists vi.mock
// calls to the top of the file for exactly this reason. the router grabs
// the mocked module at load time, so swapping return values per test is as
// simple as reaching into the mocked fns.
vi.mock("@db/stores/eventStore.js", () => ({
	eventStore: {
		findByGuildId: vi.fn(),
		findById: vi.fn(),
		// New guild-scoped variants added during F2 (Future-A migration). The routes
		// now use these instead of the legacy findById/update/delete so the same
		// code path works against both the local Mongo DB and the remote /api/events
		// surface on the platform server.
		findByIdInGuild: vi.fn(),
		updateInGuild: vi.fn(),
		deleteInGuild: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
}));

import { createEventsRouter } from "./events.routes.js";
import { eventStore } from "@db/stores/eventStore.js";

// typed helpers so we can still reach in to set return values without
// the `as any` infestation spreading across every test.
const eventStoreMock = eventStore as unknown as {
	findByGuildId: ReturnType<typeof vi.fn>;
	findById: ReturnType<typeof vi.fn>;
	findByIdInGuild: ReturnType<typeof vi.fn>;
	updateInGuild: ReturnType<typeof vi.fn>;
	deleteInGuild: ReturnType<typeof vi.fn>;
	create: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
};

function buildApp() {
	const app = express();
	app.use(express.json());
	// the Discord client is only needed by the test-reminder route. the three
	// routes under test here never touch it, so a bare cast is safe.
	app.use("/api/events", createEventsRouter({} as unknown as Client));
	return app;
}

describe("events routes guild scoping and invariants", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── priority test #6 ───────────────────────────────────────────
	// security contract: the dashboard MUST send guildId on every call.
	// if the param is missing we refuse before touching the DB.
	it("GET /api/events returns 400 when guildId query param is missing", async () => {
		const app = buildApp();

		const res = await request(app).get("/api/events");

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/guildId/);
		expect(eventStoreMock.findByGuildId).not.toHaveBeenCalled();
	});

	// ── priority test #7 ───────────────────────────────────────────
	// existence leakage prevention. when an eventId belongs to a different
	// guild the response must be 404, NOT 403. 403 would tell an attacker
	// "this id exists, you just cannot see it", which is the leak.
	it("GET /api/events/:eventId returns 404 when the event belongs to a different guild", async () => {
		// findByIdInGuild applies the guild filter at the store layer so a wrong-guild
		// lookup returns null directly. The route never sees the foreign event.
		eventStoreMock.findByIdInGuild.mockResolvedValue(null);

		const app = buildApp();
		const res = await request(app).get("/api/events/evt-1").query({ guildId: "guild-mine" });

		expect(res.status).toBe(404);
		expect(res.body.error).toBe("Event not found");
	});

	// ── priority test #8 ───────────────────────────────────────────
	// channel resolution invariant. the event schema no longer has a
	// channelId field, and the route is the last line of defense against
	// an older dashboard shipping a stale body that still includes one.
	it("POST /api/events strips channelId from the body before creating the event", async () => {
		eventStoreMock.create.mockImplementation(async (body: Record<string, unknown>) => ({
			...body,
			eventId: "evt-new",
		}));

		const app = buildApp();
		const res = await request(app)
			.post("/api/events")
			.query({ guildId: "guild-mine" })
			.send({
				name: "New Decree",
				channelId: "ch-evil-override",
				guildId: "guild-mine",
				type: "recurring",
				intervalHours: 36,
				firstOccurrence: "2030-01-01T00:00:00Z",
				seasonEnd: "2030-06-01T00:00:00Z",
			});

		expect(res.status).toBe(201);
		expect(eventStoreMock.create).toHaveBeenCalledTimes(1);

		const createArg = eventStoreMock.create.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(createArg.channelId).toBeUndefined();
		expect(createArg.guildId).toBe("guild-mine");
		expect(createArg.name).toBe("New Decree");
	});
});
