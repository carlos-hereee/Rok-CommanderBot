// the shape of a game event as it exists in the application layer
// this is what everything outside the DB works with
export interface IGameEvent {
	eventId: string;
	name: string;
	description: string;
	type: "recurring" | "one-time";
	intervalHours: number;
	firstOccurrence: Date;
	seasonEnd: Date;
	reminderOffsets: readonly number[]; // ← was number[]
	// NOTE: there is no per-event channel field. reminders always post to the
	// guild's announcements channel, resolved at fire time from GuildConfig.
	// keeping this invariant at the type level prevents a future UI from
	// accidentally reintroducing a channel picker on the event form.
	guildId: string;
	prepSteps: readonly IPrepStep[]; // ← was IPrepStep[]
	active: boolean;
	createdAt?: Date;
	updatedAt?: Date;
}

// sub-type for prep steps — mirrors the sub-schema in the Mongoose model
export interface IPrepStep {
	id: string;
	label: string; // e.g. "Activate stats token"
	order: number; // display order in the reminder embed
}

// what the admin passes in when creating an event
// eventId is excluded because the store generates it
export type TCreateEventInput = Omit<IGameEvent, "eventId" | "createdAt" | "updatedAt">;

// what the admin can update — everything optional except eventId
export type TUpdateEventInput = Partial<Omit<IGameEvent, "eventId" | "createdAt" | "updatedAt">>;

// template shape used by BOT_CONSTANTS — id not yet assigned
export type TPrepStepTemplate = Omit<IPrepStep, "id">;
