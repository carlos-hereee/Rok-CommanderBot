import { describe, it, expect, vi, beforeEach } from "vitest";
import { TextChannel } from "discord.js";
import type { Client } from "discord.js";

// mock the two stores the module writes to. imports MUST come after the
// mocks or the real mongoose modules get pulled in and the test process
// hangs trying to open a DB connection.
vi.mock("@db/stores/guildConfigStore.js", () => ({
	guildConfigStore: {
		findByGuildId: vi.fn(),
	},
}));

vi.mock("@db/stores/reminderStore.js", () => ({
	reminderStore: {
		create: vi.fn(),
		exists: vi.fn(),
		findByEventId: vi.fn(),
	},
}));

import { fireTestReminder } from "./TestReminderJob.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { reminderStore } from "@db/stores/reminderStore.js";
import { BOT_CONSTANTS } from "@base/constants/BOT_CONSTANTS.js";
import type { IGameEvent } from "@features/events/event.types.js";

const guildConfigMock = guildConfigStore as unknown as {
	findByGuildId: ReturnType<typeof vi.fn>;
};
const reminderStoreMock = reminderStore as unknown as {
	create: ReturnType<typeof vi.fn>;
};

function makeEvent(): IGameEvent {
	// firstOccurrence is deliberately in the far future so
	// getUpcomingOccurrences (called inside fireTestReminder for the preview
	// embed) always returns a real value and the test does not depend on
	// the machine clock.
	return {
		eventId: "evt-1",
		name: "Ancient Ruins",
		description: "",
		type: "recurring",
		intervalHours: 36,
		firstOccurrence: new Date("2030-01-01T12:00:00Z"),
		seasonEnd: new Date("2030-06-01T00:00:00Z"),
		reminderOffsets: [30, 15],
		guildId: "guild-1",
		// at least one prep step so testReminderEmbed.addFields does not pass
		// an empty string value into discord.js' shapeshift validator.
		prepSteps: [{ id: "step-1", label: "Activate stats token", order: 1 }],
		active: true,
	};
}

// Object.create(TextChannel.prototype) is the leanest way to produce an
// object that passes the `channel instanceof TextChannel` check inside
// fireTestReminder without pulling in a full discord.js Guild + Client
// constructor chain.
function makeTextChannel(): TextChannel & { send: ReturnType<typeof vi.fn> } {
	const ch = Object.create(TextChannel.prototype) as TextChannel & { send: ReturnType<typeof vi.fn> };
	Object.assign(ch, {
		id: "ch-announcements",
		send: vi.fn().mockResolvedValue({ id: "msg-1" }),
	});
	return ch;
}

function makeClient(channel: TextChannel | null): Client {
	return {
		channels: {
			fetch: vi.fn().mockResolvedValue(channel),
		},
	} as unknown as Client;
}

describe("fireTestReminder", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── priority test #9 ───────────────────────────────────────────
	// happy path covers the three most load bearing invariants of the
	// test fire feature in one shot:
	//   1. allowedMentions suppresses the actual ping despite rendering
	//      the role mention text, so admins can preview without spamming.
	//   2. the role mention content is built from config.memberRoleId.
	//   3. the reminder log is written with the TEST sentinel offset so
	//      the compound unique index never collides across repeated tests.
	it("happy path posts with suppressed mentions, role preview, and writes the TEST sentinel log", async () => {
		guildConfigMock.findByGuildId.mockResolvedValue({
			announcementsChannelId: "ch-announcements",
			memberRoleId: "role-member",
		});
		reminderStoreMock.create.mockResolvedValue({});

		const channel = makeTextChannel();
		const client = makeClient(channel);

		const result = await fireTestReminder(client, makeEvent());

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("typed guard"); // narrows the union for the checks below

		expect(result.messageId).toBe("msg-1");
		expect(result.channelId).toBe("ch-announcements");

		expect(channel.send).toHaveBeenCalledTimes(1);
		const sendArg = channel.send.mock.calls[0]?.[0] as {
			content: string;
			allowedMentions: Record<string, unknown>;
		};
		expect(sendArg.content).toBe("<@&role-member>");
		expect(sendArg.allowedMentions).toEqual({ parse: [], roles: [], users: [] });

		expect(reminderStoreMock.create).toHaveBeenCalledTimes(1);
		const logArg = reminderStoreMock.create.mock.calls[0]?.[0] as { offsetMinutes: number };
		expect(logArg.offsetMinutes).toBe(BOT_CONSTANTS.REMINDER_LOG_OFFSETS.TEST);
	});

	// ── priority test #10 ──────────────────────────────────────────
	// surface a readable failure when /setup has not run yet. the dashboard
	// route handler maps this reason to a user friendly message, so the
	// contract between this function and the route is what we are locking in.
	it("returns ok: false with reason guild_not_configured when the guild has no GuildConfig", async () => {
		guildConfigMock.findByGuildId.mockResolvedValue(null);
		const client = makeClient(null);

		const result = await fireTestReminder(client, makeEvent());

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("typed guard");
		expect(result.reason).toBe("guild_not_configured");
		expect(reminderStoreMock.create).not.toHaveBeenCalled();
	});
});
