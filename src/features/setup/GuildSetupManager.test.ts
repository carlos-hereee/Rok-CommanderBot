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

const guildConfigMock = guildConfigStore as unknown as {
	findByGuildId: ReturnType<typeof vi.fn>;
	create: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	deleteByGuildId: ReturnType<typeof vi.fn>;
};

// ── fixtures ──────────────────────────────────────────────────────────
// each test builds its own channels / client so one test's mock state
// cannot leak into the next. the factories keep that cheap.

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
		messages: {
			fetch: vi.fn(fetchImpl),
		},
	});
	return ch;
}

// ensureHomebase only touches client.user?.id and client.channels.fetch.
// keep the shape minimal so intent is obvious at each call site.
function makeClient(options: {
	selfId?: string | undefined;
	channelForScheduleFetch?: TextChannel | null;
}): Client {
	return {
		user: options.selfId === undefined ? null : { id: options.selfId },
		channels: {
			fetch: vi.fn().mockResolvedValue(options.channelForScheduleFetch ?? null),
		},
	} as unknown as Client;
}

// the Guild object ensureHomebase reaches into. channels.fetch(categoryId)
// drives the "category missing" branch. ownerId / id feed the rebuild call.
function makeGuild(options: {
	categoryFetchResult: unknown | Promise<unknown>;
}): Guild {
	return {
		id: "guild-1",
		ownerId: "owner-1",
		channels: {
			fetch: vi.fn().mockImplementation(async () => {
				const v = options.categoryFetchResult;
				if (v instanceof Error) throw v;
				return v as unknown;
			}),
		},
	} as unknown as Guild;
}

describe("GuildSetupManager.ensureHomebase", () => {
	// autoSetup does real Discord + Mongo work, so every branch that triggers
	// a (re)build spies on it instead of executing it. each test asserts
	// against the spy.
	let autoSetupSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		autoSetupSpy = vi.spyOn(GuildSetupManager, "autoSetup").mockResolvedValue(undefined);
	});

	it("builds fresh when no GuildConfig exists", async () => {
		guildConfigMock.findByGuildId.mockResolvedValue(null);

		const guild = makeGuild({ categoryFetchResult: null });
		const client = makeClient({ selfId: "bot-1" });

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "built" });
		expect(autoSetupSpy).toHaveBeenCalledOnce();
		expect(autoSetupSpy).toHaveBeenCalledWith(guild, { guildId: "guild-1", ownerId: "owner-1" });
		// no prior config, so the delete path must NOT fire — clearing a row
		// that never existed would still be safe but signals a wrong branch.
		expect(guildConfigMock.deleteByGuildId).not.toHaveBeenCalled();
	});

	it("rebuilds when the stored category is gone", async () => {
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig());

		// guild.channels.fetch(categoryId) resolves null — this is what the
		// real discord.js API returns when the category id no longer exists.
		const guild = makeGuild({ categoryFetchResult: null });
		const client = makeClient({ selfId: "bot-1" });

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "rebuilt" });
		// stale config MUST be cleared before autoSetup, otherwise autoSetup's
		// own `existing?.categoryId` early return would short circuit.
		expect(guildConfigMock.deleteByGuildId).toHaveBeenCalledWith("guild-1");
		expect(autoSetupSpy).toHaveBeenCalledOnce();
	});

	it("rebuilds when the stored schedule message was authored by another bot", async () => {
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig());

		// category fetch resolves to a truthy object — category is present.
		const fakeCategory = { id: "cat-1" };
		const guild = makeGuild({ categoryFetchResult: fakeCategory });

		// schedule channel exists, message exists, but author.id is some
		// other bot. this is the critical "don't adopt" case the owner
		// asked for.
		const scheduleChannel = makeScheduleChannel(async () => ({
			id: "msg-schedule",
			author: { id: "other-bot" },
		}));
		const client = makeClient({ selfId: "bot-1", channelForScheduleFetch: scheduleChannel });

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "rebuilt" });
		expect(guildConfigMock.deleteByGuildId).toHaveBeenCalledWith("guild-1");
		expect(autoSetupSpy).toHaveBeenCalledOnce();
	});

	it("rebuilds when the stored schedule message cannot be fetched", async () => {
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig());

		const fakeCategory = { id: "cat-1" };
		const guild = makeGuild({ categoryFetchResult: fakeCategory });

		// Discord 10008 Unknown Message → admin wiped the pinned message or
		// the old bot's message is truly gone. probe treats this as "not
		// ours" and rebuilds, which is exactly what the ready sweep wants.
		const scheduleChannel = makeScheduleChannel(async () => {
			// DiscordAPIError constructor signature changed across discord.js
			// majors; the shape below is what matters to our instanceof +
			// code check.
			const err = Object.create(DiscordAPIError.prototype);
			Object.assign(err, { code: 10008, message: "Unknown Message" });
			throw err;
		});
		const client = makeClient({ selfId: "bot-1", channelForScheduleFetch: scheduleChannel });

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "rebuilt" });
		expect(guildConfigMock.deleteByGuildId).toHaveBeenCalledWith("guild-1");
		expect(autoSetupSpy).toHaveBeenCalledOnce();
	});

	it("skips when the stored homebase exists and the schedule message is ours", async () => {
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig());

		const fakeCategory = { id: "cat-1" };
		const guild = makeGuild({ categoryFetchResult: fakeCategory });

		const scheduleChannel = makeScheduleChannel(async () => ({
			id: "msg-schedule",
			author: { id: "bot-1" },
		}));
		const client = makeClient({ selfId: "bot-1", channelForScheduleFetch: scheduleChannel });

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "skipped" });
		expect(autoSetupSpy).not.toHaveBeenCalled();
		expect(guildConfigMock.deleteByGuildId).not.toHaveBeenCalled();
	});

	it("rebuilds when client.user is not yet resolved", async () => {
		// defensive: if ensureHomebase is called before the client has its
		// own user (should not happen from the ready handler, but could
		// from tests or unusual startup paths) we cannot compare authorship,
		// so we refuse to adopt the stored config and rebuild. proving this
		// guarantees we never silently claim a foreign homebase.
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig());

		const fakeCategory = { id: "cat-1" };
		const guild = makeGuild({ categoryFetchResult: fakeCategory });

		const scheduleChannel = makeScheduleChannel(async () => ({
			id: "msg-schedule",
			author: { id: "someone" },
		}));
		const client = makeClient({ selfId: undefined, channelForScheduleFetch: scheduleChannel });

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "rebuilt" });
	});

	it("rebuilds when the stored scheduleMessageId is null", async () => {
		// a legacy row could exist with scheduleMessageId still null (the
		// schema permits it). without an anchor message there is no way to
		// prove ownership, so treat it as not ours.
		guildConfigMock.findByGuildId.mockResolvedValue(makeStoredConfig({ scheduleMessageId: null }));

		const fakeCategory = { id: "cat-1" };
		const guild = makeGuild({ categoryFetchResult: fakeCategory });
		// messages.fetch is never reached in this branch — the probe bails
		// on the null scheduleMessageId guard first.
		const scheduleChannel = makeScheduleChannel(async () => {
			throw new Error("should not be reached");
		});
		const client = makeClient({ selfId: "bot-1", channelForScheduleFetch: scheduleChannel });

		const result = await GuildSetupManager.ensureHomebase(client, guild);

		expect(result).toEqual({ action: "rebuilt" });
		expect(guildConfigMock.deleteByGuildId).toHaveBeenCalledWith("guild-1");
	});
});
