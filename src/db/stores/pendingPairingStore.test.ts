// src/db/stores/pendingPairingStore.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Mongoose model so these are fast, Mongo-free unit tests, matching
// the house pattern (see events.routes.test.ts mocking eventStore). The store's
// behavioral guarantees that genuinely belong to Mongo (true redeem atomicity
// under concurrency, TTL purging) would need mongodb-memory-server, which the
// repo does not pull in. Instead we pin the query + update SHAPES that make
// those guarantees hold, plus the pure generateCode.
vi.mock("@db/models/PendingPairing.js", () => ({
	PendingPairing: {
		deleteMany: vi.fn(),
		create: vi.fn(),
		findOneAndUpdate: vi.fn(),
	},
}));

import { pendingPairingStore, generateCode } from "./pendingPairingStore.js";
import { PendingPairing } from "@db/models/PendingPairing.js";

const model = PendingPairing as unknown as {
	deleteMany: ReturnType<typeof vi.fn>;
	create: ReturnType<typeof vi.fn>;
	findOneAndUpdate: ReturnType<typeof vi.fn>;
};

// Must match CODE_ALPHABET in the store. Duplicated here on purpose so a change
// to the alphabet has to be made in two places, forcing a conscious review of
// the readability tradeoff rather than a silent widening.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

describe("pendingPairingStore", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		model.deleteMany.mockResolvedValue({ deletedCount: 0 });
		model.create.mockResolvedValue({});
	});

	describe("generateCode", () => {
		it("returns a 6-char code drawn only from the unambiguous alphabet", () => {
			for (let i = 0; i < 200; i++) {
				const code = generateCode();
				expect(code).toHaveLength(6);
				for (const ch of code) expect(ALPHABET).toContain(ch);
				// the confusable glyphs must never appear
				expect(code).not.toMatch(/[01OIL]/);
			}
		});
	});

	describe("issue", () => {
		it("deletes the guild's unconsumed codes before creating a new one", async () => {
			const code = await pendingPairingStore.issue("guild-1", "owner-1");

			expect(model.deleteMany).toHaveBeenCalledWith({ guildId: "guild-1", consumedAt: null });
			expect(model.create).toHaveBeenCalledTimes(1);

			// delete must run before create, else a race could leave two live codes
			const deleteOrder = model.deleteMany.mock.invocationCallOrder[0];
			const createOrder = model.create.mock.invocationCallOrder[0];
			expect(deleteOrder).toBeLessThan(createOrder);

			const createArg = model.create.mock.calls[0][0];
			expect(createArg.code).toBe(code);
			expect(createArg.guildId).toBe("guild-1");
			expect(createArg.ownerUserId).toBe("owner-1");
			expect(createArg.expiresAt.getTime()).toBeGreaterThan(Date.now());
			expect(code).toHaveLength(6);
		});

		it("re-issuing for the same guild deletes again, so only the newest code stays live", async () => {
			await pendingPairingStore.issue("guild-1", "owner-1");
			await pendingPairingStore.issue("guild-1", "owner-1");

			expect(model.deleteMany).toHaveBeenCalledTimes(2);
			expect(model.deleteMany).toHaveBeenLastCalledWith({ guildId: "guild-1", consumedAt: null });
		});

		it("retries generation on a duplicate-key collision instead of throwing", async () => {
			const dupErr = Object.assign(new Error("dup"), { code: 11000 });
			model.create.mockRejectedValueOnce(dupErr).mockResolvedValueOnce({});

			const code = await pendingPairingStore.issue("guild-1", "owner-1");

			expect(model.create).toHaveBeenCalledTimes(2);
			expect(code).toHaveLength(6);
		});

		it("propagates a non-duplicate create error", async () => {
			model.create.mockRejectedValue(Object.assign(new Error("boom"), { code: 99 }));
			await expect(pendingPairingStore.issue("guild-1", "owner-1")).rejects.toThrow("boom");
		});
	});

	describe("redeem", () => {
		function mockResult(doc: unknown) {
			model.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(doc) });
		}

		it("consumes a valid code with an atomic, guarded findOneAndUpdate and returns the row", async () => {
			const row = { code: "ABC234", guildId: "guild-1", ownerUserId: "owner-1" };
			mockResult(row);

			const result = await pendingPairingStore.redeem("abc234");

			const [filter, update, options] = model.findOneAndUpdate.mock.calls[0];
			expect(filter.code).toBe("ABC234"); // normalized to uppercase before lookup
			expect(filter.consumedAt).toBeNull(); // only an unconsumed code matches, so single-use holds
			expect(filter.expiresAt.$gt).toBeInstanceOf(Date); // expired rows excluded before the TTL reap
			expect(update.$set.consumedAt).toBeInstanceOf(Date);
			expect(options).toMatchObject({ returnDocument: "after" });
			expect(result).toEqual(row);
		});

		it("trims and uppercases caller input before lookup", async () => {
			mockResult(null);
			await pendingPairingStore.redeem("  abc234  ");
			expect(model.findOneAndUpdate.mock.calls[0][0].code).toBe("ABC234");
		});

		it("returns null on any miss (invalid, already consumed, or expired) with no way to tell which", async () => {
			mockResult(null);
			const result = await pendingPairingStore.redeem("ZZZZZZ");
			expect(result).toBeNull();
		});
	});
});
