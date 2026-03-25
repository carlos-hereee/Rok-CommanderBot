
// DATABASE MODELS 
// 3 core tables/collections: Event, ReminderLog, PlayerActivity
// IEvent  stores the schedule definition and metadata for each recurring event (e.g. Ruins)
export interface IEvent {
    id: string,
    name: string,             // e.g. "Ruins"
    description: string,
    intervalHours: number,    // e.g. 36 or 84 (3d12h)
    firstOccurrence: Date,    // anchor point to calculate all future times
    reminderOffsets: number[] // minutes before, e.g. [30, 15]
    channelId: string,        // where to post reminders
    prepSteps: string[],      // e.g. ["Activate stats token", "Fetch rune buff"]
    active: boolean
}
// IEventReminderLog  tracks each time a reminder is sent for an event occurrence, for accountability and troubleshooting
//  one row per reminder that fires (so multiple per event occurrence if there are multiple reminderOffsets)
export interface IEventReminderLog {
    id: string,
    eventId: string,
    scheduledAt: Date,        // when the reminder was sent
    eventOccurrence: Date,    // which event instance this is for
    messageId: string,        // Discord message ID for tracking reactions
}
// IPlayerActivity  tracks player interactions with event reminders, for analytics and engagement metrics
//  one row per player per event occurrence
export interface IPlayerActivity {
    id: string,
    eventId: string,
    eventOccurrence: Date,    // which specific occurrence
    userId: string,
    username: string,
    acknowledgedReminder: boolean,
    acknowledgedAt: Date | null,
    wasOnlineAtStart: boolean,
    joinedVoiceDuring: boolean,
    voiceMinutes: number,     // how long they stayed in VC
    participationScore: number // computed field for MGE ranking
}