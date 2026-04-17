import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { requireGuildId } from "./requireGuildId.js";

// lightweight fakes instead of supertest. requireGuildId only touches
// req.query and res.status().json(), so hand rolled objects keep the test
// fast and obvious.
function makeReq(guildId: unknown): Request {
	return { query: { guildId } } as unknown as Request;
}

function makeRes() {
	const res = {
		status: vi.fn(),
		json: vi.fn(),
	};
	res.status.mockReturnValue(res);
	res.json.mockReturnValue(res);
	return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe("requireGuildId", () => {
	// ── priority test #4 ───────────────────────────────────────────
	// missing guildId must 400. this is the security contract the whole
	// dashboard API depends on. the bot never accepts a request without
	// knowing which guild it applies to.
	it("returns null and writes a 400 when guildId is missing", () => {
		const req = makeReq(undefined);
		const res = makeRes();

		const result = requireGuildId(req, res);

		expect(result).toBeNull();
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: expect.stringContaining("guildId") })
		);
	});

	// ── priority test #5 ───────────────────────────────────────────
	// happy path. the string must be trimmed so a trailing space in the
	// dashboard state does not leak into downstream mongoose queries.
	it("returns the trimmed guildId when the param is a non empty string", () => {
		const req = makeReq("  guild-123  ");
		const res = makeRes();

		const result = requireGuildId(req, res);

		expect(result).toBe("guild-123");
		expect(res.status).not.toHaveBeenCalled();
		expect(res.json).not.toHaveBeenCalled();
	});
});
