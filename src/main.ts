import { Client, GatewayIntentBits } from "discord.js";

// import { runCommand } from "./commands";
// import {deployCommands}  from "./commands/deployCommands";
// import express from "express";
import { discordToken } from "@utils/config.js";
import clientReady from "@events/ready.js";
// import { connectMongoose } from "@db/mongo.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent] });

// client.on(Events.InteractionCreate, async (interaction) => {
//   console.log("\n\ninteraction ==>", interaction, "\n\n");
//   if (!interaction.isChatInputCommand()) return;

//   if (interaction.commandName === "ping") {
//     await interaction.reply("Pong!");
//   }
// });
// // bot.on("messageCreate", runCommand);
// client.on(Events.MessageCreate, (message) => {
//   console.log("\n\nmessage ==>", message, "\n\n");
// });
clientReady(client);
client.login(discordToken);

// const server = express();
// // server.use(helmet());
// // server.use(cors());
// server.use(express.json());

// bot.on("guildCreate", async (guild) => await deployCommands( guild.id))

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

// connectMongoose(server);
