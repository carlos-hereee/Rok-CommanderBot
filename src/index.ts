import { Client, Message, GatewayIntentBits, Partials } from "discord.js";
import { runCommand } from "./commands";
// import {deployCommands}  from "./commands/deployCommands";
// import express  from "express";
import helmet from "helmet";
import cors from "cors";
import { isDev, discordToken, port, botInviteLink } from "@utils/config";
// import { connectMongoose } from "@db/mongo";

const bot = new Client({
	partials: [Partials.Channel],
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.MessageContent,
	],
});

// const server = express();
// server.use(helmet());
// server.use(cors());
// server.use(express.json());

bot.on("ready", () => {
	if (!bot.user) return;
	if (isDev) console.log(`\n*** ${bot.user.username} is ready`);
	bot.user.setStatus("online");
	bot.user.setPresence({
		afk: false,
		activities: [{ name: "Run !bothelp for commands" }],
	});
});
// bot.on("guildCreate", async (guild) => await deployCommands( guild.id))

bot.on("messageCreate", runCommand);

// bot.on("interactionCreate", async (interaction) => {
//   console.log('interactoi', interaction)
//   if (!interaction.isCommand()) {
//     return;
//   }
//   const { commandName } = interaction;
//   if (commands[commandName as keyof typeof commands]) {
//     commands[commandName as keyof typeof commands].execute(interaction);
//   }
// });

bot.login(discordToken);
// connectMongoose()
// server.listen(port, () => console.log(`\n*** Listening on port ${port}***\n`));
