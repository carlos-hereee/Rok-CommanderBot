import { Client } from "discord.js";

// ── nickname backfill ────────────────────────────────────────
// What:  enrich a list of activity-style records with each warrior's CURRENT
//        per guild nickname (or globalName, or username) at API read time.
//        Records that were written before nickname tracking landed have the
//        bare Discord username stored — without this pass the dashboard
//        would keep rendering "silent6804" forever even after the warrior
//        sets a nickname inside the guild.
// Who:   /api/players (leaderboard + profile) and /api/leaderboard.
// When:  every read. The Discord member fetch hits the cache first; uncached
//        members fall back to a network fetch which is still cheap because
//        we deduplicate userIds before fetching.
// Where: import this from any route that returns records with a userId +
//        username pair. The route owns the {data} envelope; this helper just
//        rewrites the username field in place.
// How:   ① resolve the guild from the live Discord client (cache first,
//        fetch fallback). If the client has no view of the guild — e.g.
//        the bot was kicked between requests — we return the records
//        untouched so the API still responds.
//        ② collect the unique userIds, fetch each member once in parallel,
//        and derive displayName the same way ActivityTracker does at
//        write time so both code paths agree on the canonical string.
//        ③ map the records, swapping the username field when we have a
//        fresh value. Records without a resolved member keep their stored
//        username so a row never goes blank.
export async function enrichWithNicknames<T extends { userId: string; username?: string }>(
	client: Client,
	guildId: string,
	records: T[]
): Promise<T[]> {
	if (records.length === 0) return records;

	const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
	if (!guild) return records;

	const uniqueIds = Array.from(new Set(records.map((r) => r.userId)));
	const nameById = new Map<string, string>();

	await Promise.all(
		uniqueIds.map(async (userId) => {
			const member = await guild.members.fetch(userId).catch(() => null);
			if (!member) return;
			const displayName = member.displayName ?? member.user.globalName ?? member.user.username;
			if (displayName) nameById.set(userId, displayName);
		})
	);

	return records.map((r) => {
		const fresh = nameById.get(r.userId);
		return fresh ? { ...r, username: fresh } : r;
	});
}
