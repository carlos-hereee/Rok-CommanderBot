import { describe, it, expect } from "vitest";
import type { GuildMember } from "discord.js";
import { canEditDecree } from "./permissions.js";

// ── stub helpers ────────────────────────────────────────────────────
// canEditDecree only reads three things off a GuildMember: id, guild.ownerId,
// and roles.cache.has(roleId). A minimal stub passing those checks is enough
// to lock the contract without pulling in discord.js' Guild + Client chain.

interface IStubMember {
	id: string;
	guild: { ownerId: string };
	roles: { cache: { has: (id: string) => boolean } };
}

function makeMember(opts: { id: string; ownerId: string; rolesHeld: string[] }): GuildMember {
	const stub: IStubMember = {
		id: opts.id,
		guild: { ownerId: opts.ownerId },
		roles: {
			cache: {
				has: (roleId: string) => opts.rolesHeld.includes(roleId),
			},
		},
	};
	return stub as unknown as GuildMember;
}

describe("canEditDecree", () => {
	it("returns true for the guild owner regardless of adminRoleId state", () => {
		const member = makeMember({ id: "user-owner", ownerId: "user-owner", rolesHeld: [] });
		expect(canEditDecree(member, { adminRoleId: null })).toBe(true);
		expect(canEditDecree(member, { adminRoleId: "role-admin" })).toBe(true);
	});

	it("returns true for a non-owner who holds the admin role", () => {
		const member = makeMember({ id: "user-admin", ownerId: "user-owner", rolesHeld: ["role-admin"] });
		expect(canEditDecree(member, { adminRoleId: "role-admin" })).toBe(true);
	});

	it("returns false for a non-owner who does not hold the admin role", () => {
		const member = makeMember({ id: "user-warrior", ownerId: "user-owner", rolesHeld: ["role-member"] });
		expect(canEditDecree(member, { adminRoleId: "role-admin" })).toBe(false);
	});

	it("returns false for a non-owner when adminRoleId is unset (legacy config)", () => {
		// guards the legacy-config path: a guild that ran /setup before the
		// admin role was required has adminRoleId null; only the server owner
		// retains decree-edit access until /setup is re-run with a role.
		const member = makeMember({ id: "user-warrior", ownerId: "user-owner", rolesHeld: ["role-member"] });
		expect(canEditDecree(member, { adminRoleId: null })).toBe(false);
		expect(canEditDecree(member, {})).toBe(false);
	});
});
