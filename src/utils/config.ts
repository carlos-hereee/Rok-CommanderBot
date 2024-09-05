import dotenv  from "dotenv";

dotenv.config();

 const isDev = process.env.NODE_ENV === "dev"
 const dbEnv = process.env.DB_ENV || "development"
 const clientId = process.env.DISCORD_CLIENT_ID ||""
 const discordToken = process.env.DISCORD_TOKEN ||""
 const botInviteLink =`https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&integration_type=0&scope=bot+applications.commands`
 const port = process.env.PORT || 400;
 export const uri = process.env.MONGOOSE_URI || "";


 export  { isDev, dbEnv, clientId, discordToken, botInviteLink, port}