import { describe, it, expect, vi, beforeEach } from "vitest";
import { TextChannel, DiscordAPIError } from "discord.js";
import type { Client, Guild } from "discord.js";

// mock the guild config store before importing the unit under test. the
// mongoose model chain tries to open a real DB connection at import time
// otherwise and the test process hangs. matches the pattern used in
// TestReminderJob.test.ts.
vi.mock("@db/stores/guildConfigStore.js", () => ({
	guildConfigStore: {
		findByGuildId: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		deleteByGuildId: vi.fn(),
	},
}));

import { GuildSetupManager } from "./GuildSetupManager.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { embedContent } from "@base/constants/embed-content.js";

const guildConfigMock = guildConfigStore as unknown as {
	findByGuildId: ReturnType<typeof vi.fn>;
	create: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	deleteByGuildId: ReturnType<typeof vi.fn>;
};

// ── fixtures ──────────────────────────────────────────────────────────

function makeStoredConfig(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		guildId: "guild-1",
		categoryId: "cat-1",
		introChannelId: "ch-intro",
		commandsChannelId: "ch-commands",
		leaderboardChannelId: "ch-leaderboard",
		scheduleChannelId: "ch-schedule",
		announcementsChannelId: "ch-announcements",
		adminChannelId: "ch-admin",
		scheduleMessageId: "msg-schedule",
		adminRoleId: null,
		memberRoleId: null,
		setupComplete: true,
		...overrides,
	};
}

// Object.create(TextChannel.prototype) — leanest object that still passes
// `channel instanceof TextChannel` inside ensureHomebase without pulling in
// the full discord.js Guild + Client construction chain.
function makeScheduleChannel(fetchImpl: (messageId: string) => Promise<unknown>): TextChannel {
	const ch = Object.create(TextChannel.prototype) as TextChannel;
	Object.assign(ch, {
		id: "ch-schedule",
		messages: { fetch: vi.fn(fetchImpl) },
	});
	return ch;
}

// admin channel stand in for ensureHomebase's notice post step. any test that
// expects repair notices to land must route client.channels.fetch(adminChannelId)
// to one of these so the `instanceof TextChannel` check passes.
function makeAdminChannel(id = "ch-admin"): TextChannel & { send: ReturnType<typeof vi.fn> } {
	const ch = Object.create(TextChannel.prototype) as TextChannel & { send: ReturnType<typeof vi.fn> };
	Object.assign(ch, {
		id,
		send: vi.fn().mockResolvedValue({ id: "notice-msg" }),
	});
	return ch;
}

// ensureHomebase only touches client.user?.id and client.channels.fetch.
// keep the shape minimal so intent is obvious at each call site.
function makeClient(options: {
	selfId?: string | undefined;
	fetchChannel?: (id: string) => Promise<unknown>;
}): Client {
	const fetch = options.fetchChannel
		? vi.fn(async (id: string) => {
				const v = await options.fetchChannel!(id);
				return v;
		  })
		: vi.fn().mockResolvedValue(null);
	return {
		user: options.selfId === undefined ? null : { id: options.selfId },
		channels: { fetch },
	} as unknown as Client;
}

// Guild mock with pluggable channels.fetch. the fetch map drives which of the
// six stored channel ids resolve (intact) vs return null (missing) so the
// repair path can be exercised with surgical control.
function makeGuild(options: {
	categoryId?: unknown; // what guild.channels.fetch(categoryId) returns
	channelFetchMap?: Record<string, unknown>; // per id results for repair scan
	createHandler?: (opts: unknown) => Promise<unknown>;
}): Guild {
	const categoryId = options.categoryId;
	const map = options.channelFetchMap ?? {};
	const create =
		options.createHandler ??
		vi.fn(async (opts: { name: string }) => {
			// fabricate a TextChannel shape with a unique id per creation so
			// the updated config stores something distinguishable.
			const created = Object.create(TextChannel.prototype) as TextChannel & { send: ReturnType<typeof vi.fn> };
			Object.assign(created, {
				id: `new-${opts.name}`,
				send: vi.fn().mockResolvedValue({ id: `intro-${opts.name}` }),
			});
			return created;
		});

	return {
		id: "guild-1",
		ownerId: "owner-1",
		roles: { everyone: { id: "everyone" } },
		channels: {
			fetch: vi.fn(async (id: string) => {
				if (id === "cat-1" && categoryId !== undefined) {
					if (categoryId instanceof Error) throw categoryId;
					return categoryId as unknown;
				}
				if (id in map) {
					const v = map[id];
					if (v instanceof Error) throw v;
					return v;
				}
				return null;
			}),
			create,
		},
	} as unknown as Guild;
}

describe("GuildSetupManager.ensureHomebase", () => {
	// autoSetup does real Discord + Mongo work. every branch that triggers a
	// full (re)build spies on it instead of executing it.
	let autoSetupSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		autoSetupSpy = vi.spyOn(GuildSetupManager, "autoSetup").mockResolvedValue(undefined);
	});

	it("builds fresh when no GuildConfig exists", async () => {
		guildConfigMock.findByGuildId.mockResolvedValue(null);
		const guild = makeGuild({ categoryId: null });
		const client = makeClient({ selfId: "bot-1" });

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "built", repairedChannels: [] });
		expect(autoSetupSpy).toHaveBeenCalledOnce();
		expect(guildConfigMock.deleteByGuildId).not.toHaveBeenCalled();
	});

	it("rebuilds and posts castle notice when the stored category is gone", async () => {
		// two findByGuildId calls happen: the opening read and the castle
		// notice helper re reading after the rebuild. the second read
		// returns the "fresh" config so the notice helper can resolve the
		// new admin channel.
		guildConfigMock.findByGuildId
			.mockResolvedValueOnce(makeStoredConfig())
			.mockResolvedValueOnce(makeStoredConfig({ adminChannelId: "ch-admin-new" }));

		const guild = makeGuild({ categoryId: null });
		const adminChannel = makeAdminChannel("ch-admin-new");
		const client = makeClient({
			selfId: "bot-1",
			fetchChannel: async (id) => (id === "ch-admin-new" ? adminChannel : null),
		});

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "rebuilt", repairedChannels: [] });
		// CRITICAL: deleteByGuildId must NEVER be called on the rebuild path.
		// In the shared MongoDB cluster scenario that would nuke the other
		// bot's row. The rebuild path must instead run autoSetup with
		// force:true so a potentially foreign row stays intact and an
		// 11000 duplicate key is the failure mode.
		expect(guildConfigMock.deleteByGuildId).not.toHaveBeenCalled();
		// autoSetup was invoked with force:true to bypass the early return.
		expect(autoSetupSpy).toHaveBeenCalledOnce();
		expect(autoSetupSpy).toHaveBeenCalledWith(guild, { guildId: "guild-1", ownerId: "owner-1" }, { force: true });
		// castle rebuilt embed landed in the new inner sanctum.
		expect(adminChannel.send).toHaveBeenCalledOnce();
		const sent = adminChannel.send.mock.calls[0][0] as { embeds: Array<{ data: { title: string } }> };
		expect(sent.embeds[0].data.title).toBe(embedContent.channelContent.castleRebuiltNotice.title);
	});

	it("rebuilds when the stored schedule message was authored by another bot", async () => {
		guildConfigMock.findByGuildId
			.mockResolvedValueOnce(makeStoredConfig())
			.mockResolvedValueOnce(makeStoredConfig({ adminChannelId: "ch-admin-new" }));

		const guild = makeGuild({ categoryId: { id: "cat-1" } });
		const scheduleChannel = makeScheduleChannel(async () => ({
			id: "msg-schedule",
			author: { id: "other-bot" },
		}));
		const adminChannel = makeAdminChannel("ch-admin-new");
		const client = makeClient({
			selfId: "bot-1",
			fetchChannel: async (id) => {
				if (id === "ch-schedule") return scheduleChannel;
				if (id === "ch-admin-new") return adminChannel;
				return null;
			},
		});

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "rebuilt", repairedChannels: [] });
		// rebuild path must not delete the foreign row on a shared Mongo
		// cluster. autoSetup with force:true is the correct invocation.
		expect(guildConfigMock.deleteByGuildId).not.toHaveBeenCalled();
		expect(autoSetupSpy).toHaveBeenCalledWith(guild, { guildId: "guild-1", ownerId: "owner-1" }, { force: true });
	});

	it("does NOT rebuild when the stored schedule message is missing (10008) — repairs in place", async () => {
		// Regression (auto-heal duplicate-homebase bug): a deleted/unfetchable
		// schedule message is NOT proof the homebase is foreign. The ownership
		// probe returns "unknown", so ensureHomebase keeps the category and
		// repairs in place (the schedule board reposts its message on the next
		// refresh) instead of building a duplicate homebase.
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig());

		const intact = { id: "intact" };
		const guild = makeGuild({
			categoryId: { id: "cat-1" },
			channelFetchMap: {
				"ch-intro": intact,
				"ch-commands": intact,
				"ch-leaderboard": intact,
				"ch-schedule": intact,
				"ch-announcements": intact,
				"ch-admin": intact,
			},
		});
		const scheduleChannel = makeScheduleChannel(async () => {
			const err = Object.create(DiscordAPIError.prototype);
			Object.assign(err, { code: 10008, message: "Unknown Message" });
			throw err;
		});
		const client = makeClient({
			selfId: "bot-1",
			fetchChannel: async (id) => (id === "ch-schedule" ? scheduleChannel : null),
		});

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "skipped", repairedChannels: [] });
		expect(autoSetupSpy).not.toHaveBeenCalled();
	});

	it("skips when the stored homebase exists, is ours, and every channel is intact", async () => {
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig());

		// every stored channel id resolves to a non null object. the actual
		// shape does not matter because the repair path only checks truthiness.
		const intact = { id: "intact" };
		const guild = makeGuild({
			categoryId: { id: "cat-1" },
			channelFetchMap: {
				"ch-intro": intact,
				"ch-commands": intact,
				"ch-leaderboard": intact,
				"ch-schedule": intact,
				"ch-announcements": intact,
				"ch-admin": intact,
			},
		});
		const scheduleChannel = makeScheduleChannel(async () => ({
			id: "msg-schedule",
			author: { id: "bot-1" },
		}));
		const client = makeClient({
			selfId: "bot-1",
			fetchChannel: async (id) => (id === "ch-schedule" ? scheduleChannel : null),
		});

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "skipped", repairedChannels: [] });
		expect(autoSetupSpy).not.toHaveBeenCalled();
		expect(guildConfigMock.deleteByGuildId).not.toHaveBeenCalled();
		expect(guildConfigMock.update).not.toHaveBeenCalled();
	});

	it("repairs a single missing public channel and posts a notice in the inner sanctum", async () => {
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig());

		// announcements channel is the only one missing. the other five
		// including admin are intact. this exercises the "most common"
		// deletion case: a warrior or admin wipes one channel.
		const intact = { id: "intact" };
		const guild = makeGuild({
			categoryId: { id: "cat-1" },
			channelFetchMap: {
				"ch-intro": intact,
				"ch-commands": intact,
				"ch-leaderboard": intact,
				"ch-schedule": intact,
				"ch-announcements": null,
				"ch-admin": intact,
			},
		});
		const scheduleChannel = makeScheduleChannel(async () => ({
			id: "msg-schedule",
			author: { id: "bot-1" },
		}));
		const adminChannel = makeAdminChannel("ch-admin");
		const client = makeClient({
			selfId: "bot-1",
			fetchChannel: async (id) => {
				if (id === "ch-schedule") return scheduleChannel;
				if (id === "ch-admin") return adminChannel;
				return null;
			},
		});

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result.action).toBe("repaired");
		expect(result.repairedChannels).toEqual([embedContent.setup.channels.announcements]);
		// config update ran with the new announcements channel id AND the
		// new introMessageIds map (announcementsChannelId slot freshly
		// populated with the reposted intro message id, other slots
		// preserved from the prior config).
		expect(guildConfigMock.update).toHaveBeenCalledWith("guild-1", {
			announcementsChannelId: expect.stringContaining("new-"),
			introMessageIds: expect.objectContaining({
				announcementsChannelId: expect.stringContaining("intro-"),
			}),
		});
		// notice embed landed in inner sanctum.
		expect(adminChannel.send).toHaveBeenCalledOnce();
		const sent = adminChannel.send.mock.calls[0][0] as { embeds: Array<{ data: { title: string } }> };
		expect(sent.embeds[0].data.title).toBe(embedContent.channelContent.channelRepairNotice.title);
	});

	it("repairs the admin channel itself and posts the notice into the rebuilt admin channel", async () => {
		// the config read happens: ① initial ensureHomebase read. ② the
		// fresh read at the top of repairMissingChannels. there is no
		// third read because postRepairNotices resolves the new admin
		// channel id off the in memory `stored` object updated inside
		// the repair loop.
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig());

		const intact = { id: "intact" };
		const newAdminChannel = makeAdminChannel(`new-${embedContent.setup.channels.admin}`);
		const guild = makeGuild({
			categoryId: { id: "cat-1" },
			channelFetchMap: {
				"ch-intro": intact,
				"ch-commands": intact,
				"ch-leaderboard": intact,
				"ch-schedule": intact,
				"ch-announcements": intact,
				"ch-admin": null, // admin channel was deleted
			},
			// override the default create handler so the admin channel rebuild
			// yields the same object the client.channels.fetch below will serve
			// when posting the notice. keeps the test asserting real identity
			// rather than coincidental id overlap.
			createHandler: vi.fn(async () => newAdminChannel) as unknown as (opts: unknown) => Promise<unknown>,
		});
		const scheduleChannel = makeScheduleChannel(async () => ({
			id: "msg-schedule",
			author: { id: "bot-1" },
		}));
		const client = makeClient({
			selfId: "bot-1",
			fetchChannel: async (id) => {
				if (id === "ch-schedule") return scheduleChannel;
				// the rebuilt admin channel id matches what the create
				// handler returned. repairMissingChannels updates stored
				// with that id and passes it to postRepairNotices.
				if (id === newAdminChannel.id) return newAdminChannel;
				return null;
			},
		});

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result.action).toBe("repaired");
		expect(result.repairedChannels).toEqual([embedContent.setup.channels.admin]);
		// config update with the new admin channel id plus the refreshed
		// introMessageIds map carrying the new admin intro anchor.
		expect(guildConfigMock.update).toHaveBeenCalledWith("guild-1", {
			adminChannelId: newAdminChannel.id,
			introMessageIds: expect.objectContaining({ adminChannelId: expect.any(String) }),
		});
		// notice landed in the NEW admin channel, proving the repair path
		// does not post into a deleted channel.
		expect(newAdminChannel.send).toHaveBeenCalled();
	});

	it("repairs the schedule channel and repoints scheduleMessageId at the fresh intro anchor", async () => {
		// this case calls repairMissingChannels directly instead of going
		// through ensureHomebase. in production ensureHomebase cannot reach
		// this state (a deleted schedule channel fails the ownership probe
		// first, so the whole homebase rebuilds). the repair behavior
		// itself is still worth asserting independently because anything
		// that reuses repairMissingChannels in the future needs the
		// scheduleMessageId kept in sync with the new intro post.
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig());

		const intact = { id: "intact" };
		const guild = makeGuild({
			categoryId: { id: "cat-1" },
			channelFetchMap: {
				"ch-intro": intact,
				"ch-commands": intact,
				"ch-leaderboard": intact,
				"ch-schedule": null, // schedule channel deleted
				"ch-announcements": intact,
				"ch-admin": intact,
			},
		});
		const adminChannel = makeAdminChannel("ch-admin");
		const client = makeClient({
			selfId: "bot-1",
			fetchChannel: async (id) => (id === "ch-admin" ? adminChannel : null),
		});

		const fakeCategory = { id: "cat-1" } as unknown as import("discord.js").CategoryChannel;
		const repaired = await GuildSetupManager.repairMissingChannels(client, guild, fakeCategory);

		expect(repaired).toEqual([embedContent.setup.channels.schedule]);
		// the update call for schedule channel carries the new channel id,
		// the refreshed introMessageIds map, AND scheduleMessageId pointing
		// at the fresh intro post (which IS the new pinned board anchor).
		expect(guildConfigMock.update).toHaveBeenCalledWith("guild-1", {
			scheduleChannelId: expect.stringContaining("new-"),
			introMessageIds: expect.objectContaining({ scheduleChannelId: expect.any(String) }),
			scheduleMessageId: expect.any(String),
		});
	});

	it("repairs multiple missing channels and posts one notice per channel", async () => {
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig());

		const intact = { id: "intact" };
		const guild = makeGuild({
			categoryId: { id: "cat-1" },
			channelFetchMap: {
				"ch-intro": null, // missing
				"ch-commands": intact,
				"ch-leaderboard": null, // missing
				"ch-schedule": intact,
				"ch-announcements": intact,
				"ch-admin": intact,
			},
		});
		const scheduleChannel = makeScheduleChannel(async () => ({
			id: "msg-schedule",
			author: { id: "bot-1" },
		}));
		const adminChannel = makeAdminChannel("ch-admin");
		const client = makeClient({
			selfId: "bot-1",
			fetchChannel: async (id) => {
				if (id === "ch-schedule") return scheduleChannel;
				if (id === "ch-admin") return adminChannel;
				return null;
			},
		});

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result.action).toBe("repaired");
		expect(result.repairedChannels).toEqual([embedContent.setup.channels.intro, embedContent.setup.channels.leaderboard]);
		// two repair notices posted to inner sanctum.
		expect(adminChannel.send).toHaveBeenCalledTimes(2);
	});

	it("does NOT rebuild when the stored scheduleMessageId is null — repairs in place", async () => {
		// Regression (auto-heal duplicate-homebase bug): a legacy/blank
		// scheduleMessageId is not proof of a foreign homebase either. The probe
		// returns "unknown" (no anchor to check), so we keep the category and
		// repair in place rather than building a duplicate.
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig({ scheduleMessageId: null }));

		const intact = { id: "intact" };
		const guild = makeGuild({
			categoryId: { id: "cat-1" },
			channelFetchMap: {
				"ch-intro": intact,
				"ch-commands": intact,
				"ch-leaderboard": intact,
				"ch-schedule": intact,
				"ch-announcements": intact,
				"ch-admin": intact,
			},
		});
		const client = makeClient({ selfId: "bot-1" });

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "skipped", repairedChannels: [] });
		expect(autoSetupSpy).not.toHaveBeenCalled();
		expect(guildConfigMock.deleteByGuildId).not.toHaveBeenCalled();
	});
});

// ── autoSetup persist paths ─────────────────────────────────────────────
// Separate describe block because these tests drive autoSetup directly and
// do NOT spy over it the way the ensureHomebase block does. They guard the
// two paths that matter after the shared-cluster hardening:
//   A. existing row + force:true → update in place (not create).
//   B. no existing row + create throws duplicate key (code 11000) → the
//      error is logged and rethrown, and no row is mutated.
describe("GuildSetupManager.autoSetup persistence", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// helper guild whose channels.create yields unique ids. populate step
	// sends embeds through the channel `send` mock and returns a message id.
	function makePersistGuild(): Guild {
		const makeCh = (name: string) => {
			const ch = Object.create(TextChannel.prototype) as TextChannel & {
				send: ReturnType<typeof vi.fn>;
				pin: ReturnType<typeof vi.fn>;
				guildId: string;
			};
			Object.assign(ch, {
				id: `new-${name}`,
				guildId: "guild-1",
				send: vi.fn().mockResolvedValue({ id: `msg-${name}`, pin: vi.fn().mockResolvedValue(undefined) }),
				pin: vi.fn().mockResolvedValue(undefined),
			});
			return ch;
		};
		return {
			id: "guild-1",
			ownerId: "owner-1",
			roles: { everyone: { id: "everyone" } },
			channels: {
				create: vi.fn(async (opts: { name: string; type: number }) => {
					// categories come back with just an id — populateChannels
					// never touches a category object directly.
					if (opts.type === 4) return { id: "new-cat-1" };
					return makeCh(opts.name);
				}),
			},
		} as unknown as Guild;
	}

	it("updates the existing row in place when force:true and a row already exists", async () => {
		// path B from the autoSetup persist branching. an existing row
		// means this bot already has a homebase record; force:true is used
		// by ensureHomebase to rebuild Discord-side channels while keeping
		// Phase 2 state (adminRoleId, setupComplete) intact.
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig({ adminRoleId: "role-1", setupComplete: true }));
		guildConfigMock.update.mockResolvedValue(undefined);

		const guild = makePersistGuild();
		await GuildSetupManager.autoSetup(guild, { guildId: "guild-1", ownerId: "owner-1" }, { force: true });

		// update was called, create was not. this is the whole point of
		// the update branch — do not try to insert when a row already
		// exists in the DB, because on a shared cluster that row might be
		// foreign.
		expect(guildConfigMock.update).toHaveBeenCalledOnce();
		expect(guildConfigMock.create).not.toHaveBeenCalled();
		// the update payload carries the new channel ids but deliberately
		// omits adminRoleId / setupComplete so Phase 2 state carries over.
		const [guildId, payload] = guildConfigMock.update.mock.calls[0] as [string, Record<string, unknown>];
		expect(guildId).toBe("guild-1");
		expect(payload.categoryId).toBe("new-cat-1");
		expect(payload).not.toHaveProperty("adminRoleId");
		expect(payload).not.toHaveProperty("setupComplete");
	});

	it("logs loudly and rethrows when create hits the 11000 duplicate key error", async () => {
		// path A's failure mode. no row for this guildId appears in the
		// initial find, but between the find and the create a foreign row
		// lands in the collection (or, more realistically, the collection
		// is shared with prod and the initial find used a stale cache).
		// autoSetup must surface the error rather than silently corrupt.
		guildConfigMock.findByGuildId.mockResolvedValue(null);
		const dupKey = Object.assign(new Error("E11000 duplicate key error collection"), { code: 11000 });
		guildConfigMock.create.mockRejectedValue(dupKey);

		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const guild = makePersistGuild();

		await expect(
			GuildSetupManager.autoSetup(guild, { guildId: "guild-1", ownerId: "owner-1" })
		).rejects.toBe(dupKey);

		// error was logged with the dedicated duplicate-key message. the
		// string includes "duplicate key" so the operator can grep for it.
		const loggedMessages = errorSpy.mock.calls.map((call) => String(call[0]));
		expect(loggedMessages.some((msg) => msg.includes("duplicate key"))).toBe(true);
		// critically, no update or delete was attempted — we never silently
		// overwrite the foreign row.
		expect(guildConfigMock.update).not.toHaveBeenCalled();
		expect(guildConfigMock.deleteByGuildId).not.toHaveBeenCalled();

		errorSpy.mockRestore();
	});
});

// ── refreshIntroEmbeds (boot time copy refresh) ─────────────────────────
// What: edits the six stored intro messages in place on every boot so
//       embed-content.ts copy changes ship without forcing a rebuild. If
//       the stored anchor is missing, reposts a fresh intro and persists
//       the new id. If introMessageIds is absent entirely (legacy row),
//       reposts all six.
// Who:  main.ts ready handler, after ensureHomebase completes per guild.
// Where: relies on resolveIntroEmbed to pick the correct embed per spec and
//        on ChannelContent for the rendered copy.
describe("GuildSetupManager.refreshIntroEmbeds", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// TextChannel stand in with pluggable messages.fetch and send. the
	// messages.fetch impl decides whether the stored anchor edits in place
	// (success) or triggers a repost (10008 / 10003).
	function makeChannelWithMessage(
		id: string,
		messageFetchImpl: (messageId: string) => Promise<unknown>,
		sendImpl?: () => Promise<{ id: string; pin: ReturnType<typeof vi.fn> }>
	): TextChannel & { send: ReturnType<typeof vi.fn>; messages: { fetch: ReturnType<typeof vi.fn> } } {
		const ch = Object.create(TextChannel.prototype) as TextChannel & {
			send: ReturnType<typeof vi.fn>;
			messages: { fetch: ReturnType<typeof vi.fn> };
		};
		Object.assign(ch, {
			id,
			messages: { fetch: vi.fn(messageFetchImpl) },
			send:
				sendImpl !== undefined
					? vi.fn(sendImpl)
					: vi.fn().mockResolvedValue({ id: `reposted-${id}`, pin: vi.fn().mockResolvedValue(undefined) }),
		});
		return ch;
	}

	// minimal guild — refreshIntroEmbeds only reads guild.ownerId (for admin
	// embed resolution) and guild.id (for log interpolation).
	function makeGuildFixture(): Guild {
		return {
			id: "guild-1",
			ownerId: "owner-1",
		} as unknown as Guild;
	}

	it("edits every stored intro in place when all anchors resolve", async () => {
		// each of the six channel ids has an intro message id stored. the
		// message fetches all succeed, so every edit is in place and nothing
		// gets reposted or repersisted.
		const storedIntroIds = {
			introChannelId: "msg-intro",
			commandsChannelId: "msg-commands",
			leaderboardChannelId: "msg-leaderboard",
			scheduleChannelId: "msg-schedule",
			announcementsChannelId: "msg-announcements",
			adminChannelId: "msg-admin",
		};
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig({ introMessageIds: storedIntroIds }));

		// every channel's fetch returns a message with a spyable edit.
		const edits: ReturnType<typeof vi.fn>[] = [];
		const channels: Record<string, TextChannel> = {};
		for (const [field, msgId] of Object.entries(storedIntroIds)) {
			const edit = vi.fn().mockResolvedValue(undefined);
			edits.push(edit);
			const channelId = makeStoredConfig()[field as keyof ReturnType<typeof makeStoredConfig>] as string;
			channels[channelId] = makeChannelWithMessage(channelId, async (id) => {
				if (id === msgId) return { id: msgId, edit };
				throw new Error(`unexpected message fetch: ${id}`);
			});
		}

		const client = makeClient({
			selfId: "bot-1",
			fetchChannel: async (id) => channels[id] ?? null,
		});

		const summary = await GuildSetupManager.refreshIntroEmbeds(client, makeGuildFixture());

		expect(summary).toEqual({ edited: 6, reposted: 0 });
		// all six edits fired, none were reposts.
		for (const edit of edits) expect(edit).toHaveBeenCalledOnce();
		// no persist needed when every anchor still exists.
		expect(guildConfigMock.update).not.toHaveBeenCalled();
	});

	it("reposts a fresh intro when the stored anchor is missing (10008)", async () => {
		// stored anchors exist but one fetch throws Unknown Message (10008).
		// the refresh loop must repost a fresh intro and persist the new id
		// under introMessageIds so the next boot edits in place.
		const storedIntroIds = {
			introChannelId: "msg-intro",
			commandsChannelId: "msg-commands",
			leaderboardChannelId: "msg-leaderboard",
			scheduleChannelId: "msg-schedule",
			announcementsChannelId: "msg-gone",
			adminChannelId: "msg-admin",
		};
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig({ introMessageIds: storedIntroIds }));
		guildConfigMock.update.mockResolvedValue(undefined);

		const okEdit = vi.fn().mockResolvedValue(undefined);
		const channels: Record<string, TextChannel> = {};
		// five healthy channels — edit in place.
		for (const field of ["introChannelId", "commandsChannelId", "leaderboardChannelId", "scheduleChannelId", "adminChannelId"] as const) {
			const channelId = makeStoredConfig()[field] as string;
			const msgId = storedIntroIds[field];
			channels[channelId] = makeChannelWithMessage(channelId, async () => ({ id: msgId, edit: okEdit }));
		}
		// announcements channel: fetch throws 10008 → repost path.
		channels["ch-announcements"] = makeChannelWithMessage(
			"ch-announcements",
			async () => {
				const err = Object.create(DiscordAPIError.prototype);
				Object.assign(err, { code: 10008, message: "Unknown Message" });
				throw err;
			},
			async () => ({ id: "msg-announcements-fresh", pin: vi.fn().mockResolvedValue(undefined) })
		);

		const client = makeClient({
			selfId: "bot-1",
			fetchChannel: async (id) => channels[id] ?? null,
		});

		const summary = await GuildSetupManager.refreshIntroEmbeds(client, makeGuildFixture());

		expect(summary).toEqual({ edited: 5, reposted: 1 });
		// persisted the new announcements id alongside the preserved ids for
		// the other five slots.
		expect(guildConfigMock.update).toHaveBeenCalledWith("guild-1", {
			introMessageIds: expect.objectContaining({ announcementsChannelId: "msg-announcements-fresh" }),
		});
	});

	it("reposts all six when introMessageIds is absent (legacy row)", async () => {
		// legacy row: introMessageIds never set. every spec falls into the
		// repost path and the persist at the end covers all six.
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig({ introMessageIds: null }));
		guildConfigMock.update.mockResolvedValue(undefined);

		const channels: Record<string, TextChannel> = {};
		for (const spec of GuildSetupManager.CHANNEL_SPECS) {
			const channelId = makeStoredConfig()[spec.configField] as string;
			channels[channelId] = makeChannelWithMessage(
				channelId,
				async () => {
					throw new Error("never called — no anchor to fetch");
				},
				async () => ({ id: `reposted-${spec.configField}`, pin: vi.fn().mockResolvedValue(undefined) })
			);
		}

		const client = makeClient({
			selfId: "bot-1",
			fetchChannel: async (id) => channels[id] ?? null,
		});

		const summary = await GuildSetupManager.refreshIntroEmbeds(client, makeGuildFixture());

		expect(summary).toEqual({ edited: 0, reposted: 6 });
		// single persist batched at the end. introMessageIds carries six
		// fresh ids and scheduleMessageId is kept in sync with the schedule
		// channel's new intro anchor.
		expect(guildConfigMock.update).toHaveBeenCalledOnce();
		const [, payload] = guildConfigMock.update.mock.calls[0] as [string, Record<string, unknown>];
		const ids = payload.introMessageIds as Record<string, string>;
		expect(ids.introChannelId).toBe("reposted-introChannelId");
		expect(ids.commandsChannelId).toBe("reposted-commandsChannelId");
		expect(ids.leaderboardChannelId).toBe("reposted-leaderboardChannelId");
		expect(ids.scheduleChannelId).toBe("reposted-scheduleChannelId");
		expect(ids.announcementsChannelId).toBe("reposted-announcementsChannelId");
		expect(ids.adminChannelId).toBe("reposted-adminChannelId");
		// scheduleMessageId repointed at the new anchor so ScheduleBoard does
		// not chase a dangling pointer.
		expect(payload.scheduleMessageId).toBe("reposted-scheduleChannelId");
	});

	it("skips the edit on 50005 (author mismatch) without reposting", async () => {
		// 50005 means our stored id points at a message authored by someone
		// else — corruption scenario. we must NOT repost (that would duplicate
		// content) and we must NOT edit (Discord would reject). bail so
		// ensureHomebase can detect ownership drift on its next pass.
		const storedIntroIds = {
			introChannelId: "msg-intro",
			commandsChannelId: "msg-commands",
			leaderboardChannelId: "msg-leaderboard",
			scheduleChannelId: "msg-schedule",
			announcementsChannelId: "msg-foreign",
			adminChannelId: "msg-admin",
		};
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig({ introMessageIds: storedIntroIds }));

		const okEdit = vi.fn().mockResolvedValue(undefined);
		const channels: Record<string, TextChannel> = {};
		for (const field of ["introChannelId", "commandsChannelId", "leaderboardChannelId", "scheduleChannelId", "adminChannelId"] as const) {
			const channelId = makeStoredConfig()[field] as string;
			const msgId = storedIntroIds[field];
			channels[channelId] = makeChannelWithMessage(channelId, async () => ({ id: msgId, edit: okEdit }));
		}
		// announcements channel: messages.fetch returns an edit that rejects
		// with 50005. repost path must NOT fire.
		const badEdit = vi.fn().mockImplementation(async () => {
			const err = Object.create(DiscordAPIError.prototype);
			Object.assign(err, { code: 50005, message: "Cannot edit a message authored by another user" });
			throw err;
		});
		channels["ch-announcements"] = makeChannelWithMessage(
			"ch-announcements",
			async () => ({ id: "msg-foreign", edit: badEdit })
		);
		const announcementsSend = (channels["ch-announcements"] as unknown as { send: ReturnType<typeof vi.fn> }).send;

		const client = makeClient({
			selfId: "bot-1",
			fetchChannel: async (id) => channels[id] ?? null,
		});

		const summary = await GuildSetupManager.refreshIntroEmbeds(client, makeGuildFixture());

		// five edited, announcements skipped. no repost, no persist.
		expect(summary).toEqual({ edited: 5, reposted: 0 });
		expect(announcementsSend).not.toHaveBeenCalled();
		expect(guildConfigMock.update).not.toHaveBeenCalled();
	});

	it("returns zero summary when no GuildConfig exists", async () => {
		// defensive: if ensureHomebase somehow missed this guild, the refresh
		// loop is a no op instead of crashing.
		guildConfigMock.findByGuildId.mockResolvedValue(null);
		const client = makeClient({ selfId: "bot-1" });

		const summary = await GuildSetupManager.refreshIntroEmbeds(client, makeGuildFixture());

		expect(summary).toEqual({ edited: 0, reposted: 0 });
		expect(guildConfigMock.update).not.toHaveBeenCalled();
	});
});
