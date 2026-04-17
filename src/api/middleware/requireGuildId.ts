import { Request, Response } from "express";

/**
 * Extract and validate the `guildId` query parameter from a request.
 *
 * Every protected dashboard route must receive a guildId so the v1 contract
 * is honored from day one. This matches the forward compatibility rule in
 * section 3 of the dashboard design spec: when the bot eventually supports
 * multiple guilds per api key, the dashboard flips a single piece of state
 * at the shell level to switch guilds, and every route already honors the
 * parameter so no page needs to change.
 *
 * Returns the guildId as a string on success.
 * Returns null and writes a 400 response on failure. Callers must early-return
 * when this returns null so the route handler does not continue running.
 *
 * Usage:
 *
 *   const guildId = requireGuildId(req, res);
 *   if (guildId === null) return;
 *    ... guildId is now a non-empty string
 */
export function requireGuildId(req: Request, res: Response): string | null {
	const raw = req.query.guildId;

	if (typeof raw !== "string" || raw.trim().length === 0) {
		res.status(400).json({
			error: "Missing required query parameter: guildId",
			detail:
				"Every dashboard request must include ?guildId=<discord-guild-id>. " +
				"See dashboard spec section 3 for the forward compatibility rule.",
		});
		return null;
	}

	return raw.trim();
}
