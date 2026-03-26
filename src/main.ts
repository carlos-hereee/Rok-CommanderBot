import { GatewayIntentBits, Collection, Events, MessageFlags, Client, Partials, } from "discord.js";
import { discordToken, isDev } from "@utils/config.js";
import clientReady from "@commands/utility/ready.js";
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from "url";
import { startScheduler } from "@features/reminders/ReminderScheduler.js";
import { connectMongoose } from "@db/db";
import { registerActivityListeners } from "@features/activity-tracking/ActivityTracker";

// paths 
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,       // ← needed for member data
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,   // ← needed for VoiceStateUpdate
        GatewayIntentBits.GuildPresences,     // ← needed for PresenceUpdate
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions, // ← needed for MessageReactionAdd

    ],
    // Discord only sends full data for recent messages. 
    // For older messages it sends a "partial" — an incomplete object with just the ID.
    //  Without declaring `Partials.Message`, `Partials.Reaction`, and `Partials.User`, 
    // reactions on reminder messages that are more than a few minutes old will be silently ignored,
    //  and `reaction.fetch()` in the listener won't work correctly.
    partials: [
        Partials.Message,   // ← needed to catch reactions on older messages
        Partials.Reaction,  // ← needed to catch reactions on older messages
        Partials.User,
    ]
});




clientReady(client);
client.commands = new Collection();


const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

// load commands first
(async () => {
    // command loader loop
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
                if (isDev) console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }

    // connect to db before starting the bot to ensure it's ready when commands are executed
    await connectMongoose()

    // then register the inteaction listerner
    client.on(Events.InteractionCreate, async (interaction) => {
        //  only handle slash commands
        if (!interaction.isChatInputCommand()) return;
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            if (isDev) console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }
        try {
            await command.execute(interaction);
        } catch (error) {
            if (isDev) console.error(error);
            await interaction.reply({
                content: "There was an error executing this command!",
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    // start the scheduler after commands are loaded 
    // && after client is ready (since it relies on the client to send messages)
    client.once(Events.ClientReady, () => {
        startScheduler(client);
        registerActivityListeners(client);
        if (isDev) console.log("Scheduler and activity tracker started");
    });

    // start the scheduler after commands are loaded 
    // && after client is ready (since it relies on the client to send messages)
    client.once(Events.ClientReady, () => {
        startScheduler(client)
        if (isDev) {
            console.log('====================================');
            console.log("Scheduler started");
            console.log('====================================');
        }
    })

    // login the bot after everything is set up 
    client.login(discordToken);

})()

