import { REST, Routes } from "discord.js";
import { clientId, discordGuildId, discordToken } from "@utils/config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];

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
		}
	}
}

const rest = new REST().setToken(discordToken);

try {
	console.log(`Refreshing ${commands.length} application (/) commands...`);

	const data: any = await rest.put(Routes.applicationGuildCommands(clientId, discordGuildId), { body: commands });

	console.log(`Successfully reloaded ${data.length} application (/) commands.`);
} catch (error) {
	console.error(error);
}
