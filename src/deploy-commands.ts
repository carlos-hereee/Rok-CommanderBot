import { REST, RESTPostAPIApplicationCommandsJSONBody, Routes } from "discord.js";
import type { RESTPutAPIApplicationGuildCommandsResult } from "discord-api-types/v10";
import { clientId, discordGuildId, discordToken, isProduction } from "@utils/config.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";
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
			console.warn(LOG_MESSAGES.deploy.commandLoadWarning(filePath));
		}
	}
}

if (!clientId || !discordToken) {
	console.error(LOG_MESSAGES.deploy.missingCredentials);
	process.exit(1);
}

if (!isProduction && !discordGuildId) {
	console.error(LOG_MESSAGES.deploy.missingGuildId);
	process.exit(1);
}

const rest = new REST().setToken(discordToken);

try {
	console.log(LOG_MESSAGES.deploy.refreshing(commands.length, isProduction ? "GLOBAL" : "GUILD"));

	if (isProduction) {
		const data = (await rest.put(Routes.applicationCommands(clientId), {
			body: commands,
		})) as RESTPutAPIApplicationGuildCommandsResult;

		console.log(LOG_MESSAGES.deploy.globalSuccess(data.length));
		console.log(LOG_MESSAGES.deploy.globalPropagationNote);
	} else {
		const data = (await rest.put(Routes.applicationGuildCommands(clientId, discordGuildId!), {
			body: commands,
		})) as RESTPutAPIApplicationGuildCommandsResult;

		console.log(LOG_MESSAGES.deploy.guildSuccess(data.length));
	}
} catch (error) {
	console.error(error);
	process.exit(1);
}
