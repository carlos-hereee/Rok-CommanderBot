import "dotenv/config.js";

const isDev = process.env.NODE_ENV === "dev";
const isProduction = process.env.NODE_ENV === "production";
const dbEnv = process.env.DB_ENV || "development";

// ── client id ────────────────────────────────────────────────
// What:  pick the bot's Discord client id based on NODE_ENV so dev
//        and prod can coexist in a single .env file (or be set in
//        separate Railway environment scopes) without ever risking
//        the dev process attaching to the prod application id.
// Who:   deploy-commands.ts, botInviteLink (below), and any future
//        code path that needs to reference the bot's identity.
// When:  read once at module load. Process restart picks up env
//        changes; live edits do not.
// Where: NOTE — Discord client ids are NOT secrets. They appear on
//        every OAuth URL and the bot's Discord profile. Storing
//        them in env is purely an environment-separation
//        convenience; the only true secret in this file is
//        DISCORD_TOKEN.
// How:   ① if NODE_ENV=production AND DISCORD_CLIENT_ID_PROD is
//          set, use it.
//        ② otherwise, if dev/anything-else AND DISCORD_CLIENT_ID_DEV
//          is set, use it.
//        ③ legacy fallback to the single DISCORD_CLIENT_ID var so
//          existing deployments that haven't migrated to the split
//          form keep working.
//        ④ empty string sentinel if nothing is set; deploy-commands
//          surfaces a missing-credentials error in that case.
const clientId = (() => {
	if (isProduction && process.env.DISCORD_CLIENT_ID_PROD) {
		return process.env.DISCORD_CLIENT_ID_PROD;
	}
	if (!isProduction && process.env.DISCORD_CLIENT_ID_DEV) {
		return process.env.DISCORD_CLIENT_ID_DEV;
	}
	return process.env.DISCORD_CLIENT_ID || "";
})();

const discordToken = process.env.DISCORD_TOKEN || "";
const discordGuildId = process.env.DISCORD_GUILD_ID || "";
// ── discordGuildIds (plural) ───────────────────────────────────
// What:  comma-separated parsing of DISCORD_GUILD_ID so dev-mode
//        deploy-commands can register to multiple test guilds in
//        one run. Setting DISCORD_GUILD_ID="1234,5678,9012" pushes
//        the slash command schemas to each guild in sequence.
//        Single-id values still work — the split gives a one-
//        element array, which deploy-commands iterates over the
//        same way as a multi-id value.
// Who:   deploy-commands.ts at the dev branch.
// When:  read once at module load. Solo dev workflow: each
//        deploy-commands run hits every listed guild.
// Where: trims whitespace and filters empties so trailing commas
//        or extra spaces in the env string do not silently produce
//        empty-string guild ids that Discord rejects with 404.
// How:   plain split, no schema validation — Discord's API will
//        reject a malformed snowflake at registration time, which
//        surfaces in the deploy-commands output for fast feedback.
const discordGuildIds = discordGuildId
	.split(",")
	.map((id) => id.trim())
	.filter((id) => id.length > 0);
const creatorId = process.env.CREATOR_DISCORD_ID || "";

// ── bot invite link ───────────────────────────────────────────
// What:  the canonical OAuth2 install URL for whichever bot
//        identity is loaded in this process (dev or prod). Wired
//        into the introductions intro embed via ChannelContent so
//        a dev instance never serves the prod invite URL.
// Who:   ChannelContent.introductionComponents() consumes this.
// When:  evaluated once at module load with the resolved clientId.
// Where: permissions=8 (Administrator) ships today as a known
//        workaround for the Discord catch-22 around bot member
//        overwrites in private channels. Tech-debt item is to
//        refactor channel creation to use the bot's integration
//        role overwrite and drop back to the minimum-bits set
//        (268659792) — see BOT_CONSTANTS.MIN_PERMISSIONS_DOCS.
const botInviteLink = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&integration_type=0&scope=bot+applications.commands`;
const port = process.env.PORT || 4937;
const uri = process.env.MONGOOSE_URI || "";
const dashboardApiKey = process.env.DASHBOARD_API_KEY || "";
// Shared HMAC secret used by the dashboard's Heroku proxy to sign each forwarded request.
// Empty during rollout — the auth middleware falls back to apiKeyAuth until this is set
// on both sides. Once present, signed requests are accepted and apiKey alone is rejected.
// Reused for the reverse direction (bot → server) by serverApi.ts.
const dashboardSigningSecret = process.env.DASHBOARD_SIGNING_SECRET || "";

// ── Future-A remote events flag ──
// What: when true, eventStore reads/writes route through the nexious-server's
//   /api/events surface instead of this bot's local Mongo `Event` collection.
// Who: every slash command, scheduler tick, and HTTP route that calls eventStore.
// When: flipped to true AFTER F4 migration has copied existing events from the bot
//   DB to the server DB. Default false so deploying the F2 code without the flag set
//   is a no-op (safe rollback path).
// Where: read by db/stores/eventStore.ts which delegates to remoteEventStore when on.
// How: any non-empty truthy string ("1", "true", "yes") turns it on. Empty/unset = off.
const useRemoteEvents = (() => {
	const raw = (process.env.USE_REMOTE_EVENTS ?? "").toLowerCase().trim();
	return raw === "1" || raw === "true" || raw === "yes";
})();
// CORS allow-list for the dashboard.
// What: the Express `cors({ origin })` middleware accepts a string (single
//   origin), an array (multiple origins), or a function. We want multiple
//   origins in prod (e.g. the production Vercel URL AND any preview deploys)
//   without redeploying the bot every time we add one, so this supports a
//   comma-separated env var.
// Who: consumed by src/api/server.ts when it calls cors({ origin }). The
//   allowed origins must include every host the browser loads the Company
//   Uno client from — misconfigure this and the browser blocks every API
//   call from the dashboard with a CORS error.
// When: read once at bot boot. Change of env var requires a restart.
// Where: the Heroku-hosted server is NOT an origin — it is a backend calling
//   this bot via node-fetch which is not CORS-constrained. Only browser
//   origins belong in this list.
// How: split on commas, trim, drop empties. If nothing is set we fall back
//   to localhost for dev ergonomics, but emit a LOUD warn on boot so a prod
//   deploy that forgot DASHBOARD_ORIGIN is obvious in Railway logs.
const dashboardOriginRaw = process.env.DASHBOARD_ORIGIN || "";
const dashboardOrigin: string | string[] = dashboardOriginRaw
	? dashboardOriginRaw.split(",").map((o) => o.trim()).filter(Boolean)
	: "http://localhost:5173";
if (isProduction && !dashboardOriginRaw) {
	// Don't crash — some operators may rely on a reverse proxy handling CORS.
	// But log loud enough that the first thing they see in Railway logs is this.
	console.warn(
		"[config] DASHBOARD_ORIGIN not set in production — defaulting to http://localhost:5173. " +
		"The production Vercel client will be blocked by CORS. Set DASHBOARD_ORIGIN to your " +
		"Vercel URL (comma-separated for multiple) and restart.",
	);
}

export {
	isDev,
	isProduction,
	dbEnv,
	clientId,
	discordToken,
	discordGuildId,
	discordGuildIds,
	creatorId,
	botInviteLink,
	port,
	uri,
	dashboardApiKey,
	dashboardSigningSecret,
	dashboardOrigin,
	useRemoteEvents,
};
