import { GatewayIntentBits, Collection, Events, MessageFlags, ClientOptions, Client, } from "discord.js";
import { discordToken } from "@utils/config.js";
import clientReady from "@commands/utility/ready.js";
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from "url";


// paths 
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent] });




clientReady(client);
client.commands = new Collection();


const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

// load commands first
(async () => {
    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js') || file.endsWith('.cjs'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const commandModule = await import(pathToFileURL(filePath).href);
            const command = commandModule.default ?? commandModule; // handles both cases

            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }
    // then register the inteaction listerner
    client.on(Events.InteractionCreate, async (interaction) => {
        //  only handle slash commands
        if (!interaction.isChatInputCommand()) return;
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: "There was an error executing this command!",
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    // login the bot after everything is set up 
    client.login(discordToken);

})()

