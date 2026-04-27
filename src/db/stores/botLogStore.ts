import { BotLog } from "@db/models/BotLog.js";

// ── audit-log shape ────────────────────────────────────────────────
// Decree edits (apply-once + apply-permanent) reuse the existing BotLog
// collection rather than introducing a parallel AuditLog model. The
// metadata field is Mixed so the {actorId, eventId, action, before, after}
// envelope below fits without a schema migration. Audit queries
// (logAudit / findAuditByEvent / findAuditByActor) are scoped to events
// matching the AUDIT_EVENT_PREFIX so audit rows do not pollute the
// regular operational log queries.
const AUDIT_EVENT_PREFIX = "audit:";

export type TAuditAction =
	// per-occurrence override applied to a single fire window
	| "decree_edit_once"
	// underlying Event document mutated; affects every future occurrence
	| "decree_edit_permanent";

export interface IAuditMetadata {
	actorId: string;
	eventId: string;
	action: TAuditAction;
	// Snapshot of the relevant event fields BEFORE the edit. JSON-friendly
	// shape (no Mongoose Documents). Used by the audit UI to diff the change.
	before: Record<string, unknown>;
	// Snapshot AFTER the edit. For apply-once this is the override values;
	// for apply-permanent this is the new values written to the Event doc.
	after: Record<string, unknown>;
	// Only set for apply-once. Anchors the audit row to the specific
	// occurrence the override targets.
	originalOccurrence?: string; // ISO string for JSON-friendliness in metadata
}

export const botLogStore = {
	// check if an event has been logged for a guild
	async has(guildId: string, event: string): Promise<boolean> {
		return !!(await BotLog.findOne({ guildId, event }));
	},

	// log an event for a guild
	async log(guildId: string, event: string, metadata: Record<string, unknown> = {}): Promise<void> {
		await BotLog.create({ guildId, event, metadata });
	},

	// get all logs for a guild
	async getAll(guildId: string): Promise<{ event: string; metadata: unknown; createdAt: Date }[]> {
		return BotLog.find({ guildId }).sort({ createdAt: -1 }).lean();
	},

	// get all logs for a specific event across all guilds
	async getAllByEvent(event: string): Promise<{ guildId: string; metadata: unknown; createdAt: Date }[]> {
		return BotLog.find({ event }).sort({ createdAt: -1 }).lean();
	},

	// ── audit helpers ──
	// Write a decree-edit audit row. The event field is namespaced with
	// AUDIT_EVENT_PREFIX so audit rows never accidentally surface in the
	// generic getAll/getAllByEvent queries unless the caller asks for
	// audit-prefixed events explicitly.
	async logAudit(guildId: string, metadata: IAuditMetadata): Promise<void> {
		await BotLog.create({
			guildId,
			event: `${AUDIT_EVENT_PREFIX}${metadata.action}`,
			metadata: metadata as unknown as Record<string, unknown>,
		});
	},

	// Read every audit row for a single event across all guilds. Used by
	// the future "decree history" view; today only callable via Mongo
	// directly but exported now so the contract is locked in.
	async findAuditByEvent(eventId: string): Promise<{ guildId: string; metadata: IAuditMetadata; createdAt: Date }[]> {
		const docs = await BotLog.find({
			event: { $regex: `^${AUDIT_EVENT_PREFIX}` },
			"metadata.eventId": eventId,
		})
			.sort({ createdAt: -1 })
			.lean();
		return docs as unknown as { guildId: string; metadata: IAuditMetadata; createdAt: Date }[];
	},
};
