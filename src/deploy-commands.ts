import { REST, RESTPostAPIApplicationCommandsJSONBody, Routes } from "discord.js";
import type { RESTPutAPIApplicationGuildCommandsResult } from "discord-api-types/v10";
import { clientId, discordGuildId, discordToken } from "@utils/config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands: RESTPostAPIApplicationCommandsJSONBody[] = [];

const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js") || file.endsWith(".cjs"));

	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const commandModule = await import(pathToFileURL(filePath).href);
		const command = commandModule.default ?? commandModule;
		if ("data" in command && "execute" in command) {
			commands.push(command.data.toJSON());
		} else {
			console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}
// console.log("Commands to deploy:", commands);
if (!clientId || !discordToken || !discordGuildId) {
	console.error("[ERROR] Missing required environment variables: DISCORD_CLIENT_ID, DISCORD_TOKEN, or DISCORD_GUILD_ID.");
	process.exit(1);
}

const rest = new REST().setToken(discordToken);

try {
	console.log(`Refreshing ${commands.length} application (/) commands...`);

	const data = (await rest.put(Routes.applicationGuildCommands(clientId, discordGuildId), {
		body: commands,
	})) as RESTPutAPIApplicationGuildCommandsResult;

	console.log(`Successfully reloaded ${data.length} application (/) commands.`);
} catch (error) {
	console.error(error);
	process.exit(1);
}
