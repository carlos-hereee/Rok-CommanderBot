// the shape of a game event as it exists in the application layer
// this is what everything outside the DB works with
export interface IGameEvent {
    eventId: string;
    name: string;
    description: string;
    intervalHours: number;
    firstOccurrence: Date;
    reminderOffsets: readonly number[]; // ← was number[]
    channelId: string;
    guildId: string;
    prepSteps: readonly IPrepStep[];  // ← was IPrepStep[]
    active: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

// sub-type for prep steps — mirrors the sub-schema in the Mongoose model
export interface IPrepStep {
    id: string;
    label: string;    // e.g. "Activate stats token"
    order: number;    // display order in the reminder embed
}

// what the admin passes in when creating an event
// eventId is excluded because the store generates it
export type TCreateEventInput = Omit<IGameEvent, "eventId" | "createdAt" | "updatedAt">;

// what the admin can update — everything optional except eventId
export type TUpdateEventInput = Partial<Omit<IGameEvent, "eventId" | "createdAt" | "updatedAt">>;

// template shape used by BOT_CONSTANTS — id not yet assigned
export type TPrepStepTemplate = Omit<IPrepStep, "id">;