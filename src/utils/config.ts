import "dotenv/config.js";

const isDev = process.env.NODE_ENV === "dev";
const isProduction = process.env.NODE_ENV === "production";
const dbEnv = process.env.DB_ENV || "development";
const clientId = process.env.DISCORD_CLIENT_ID || "";
const discordToken = process.env.DISCORD_TOKEN || "";
const discordGuildId = process.env.DISCORD_GUILD_ID || "";
const creatorId = process.env.CREATOR_DISCORD_ID || "";
const botInviteLink = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&integration_type=0&scope=bot+applications.commands`;
const port = process.env.PORT || 4937;
const uri = process.env.MONGOOSE_URI || "";
const dashboardApiKey = process.env.DASHBOARD_API_KEY || "";
const dashboardOrigin = process.env.DASHBOARD_ORIGIN || "http://localhost:5173";

export {
	isDev,
	isProduction,
	dbEnv,
	clientId,
	discordToken,
	discordGuildId,
	creatorId,
	botInviteLink,
	port,
	uri,
	dashboardApiKey,
	dashboardOrigin,
};
