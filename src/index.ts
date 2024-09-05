import { Client }  from "discord.js";
import commands  from "./commands";
import express  from "express";
import helmet  from "helmet";
import cors  from "cors";
import {isDev, discordToken, port} from '@utils/config'

const client = new Client({  intents: ["Guilds", "GuildMessages", "DirectMessages"],});
const server = express();

server.use(helmet());
server.use(cors());
server.use(express.json());


client.on("ready", () => {
  console.log("Discord bot is ready! 🤖");
  // if (!isDev) {
  //   client.user.setStatus("online");
  //   client.user.setPresence({
  //     game: {
  //       name: `Run "!bot"  for commands`,
  //       type: "PLAYING",
  //     },
  //   });
  // } else {
  //   console.log("in development");
  //   client.user.setStatus("online");
  //   client.user.setPresence({
  //     game: {
  //       name: `Run "!bot" for commands`,
  //       type: "PLAYING",
  //     },
  //   });
  // }
});
client.on("message", (message) => {
  if (message.content[0] === "!") {
    const command = message.content.split(" ")[0].substr(1);
    commands.handler(command, message);
  }
});

client.login(process.env.BOT_TOKEN);

server.listen(port, () => console.log(`\n*** Listening on port ${port}***\n`));
