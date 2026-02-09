import { Client } from "discord.js";
// import { runCommand } from "./commands";
// import {deployCommands}  from "./commands/deployCommands";
import express from "express";
// import helmet from "helmet";
// import cors from "cors";
import { isDev, discordToken } from "@utils/config";
import { connectMongoose } from "@db/mongo";

const client = new Client({
  // partials: [Partials.Channel],
  intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS", "MESSAGE_CONTENT"],
});

const server = express();
// server.use(helmet());
// server.use(cors());
server.use(express.json());

client.on("ready", () => {
  if (!client.user) return;
  if (isDev) console.log(`\n*** ${client.user.username} is ready`);
  client.user.setStatus("online");
  client.user.setPresence({
    afk: false,
    activities: [{ name: "Run !bothelp for commands" }],
  });
});
// bot.on("guildCreate", async (guild) => await deployCommands( guild.id))

// bot.on("messageCreate", runCommand);

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

client.login(discordToken);

connectMongoose(server);
