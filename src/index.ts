/* eslint-disable no-undef */
import dotenv  from "dotenv";
import { Client }  from "discord.js";
import commands  from "./commands/commands";
import express  from "express";
import helmet  from "helmet";
import cors  from "cors";

dotenv.config();
const port = process.env.PORT || 400;
const client = new Client();
const server = express();

server.use(helmet());
server.use(cors());
server.use(express.json());

client.on("ready", () => {
  if (process.env.NODE_ENV === "production") {
    client.user.setStatus("online");
    client.user.setPresence({
      game: {
        name: `Run "!bot"  for commands`,
        type: "PLAYING",
      },
    });
  } else {
    console.log("in development");
    client.user.setStatus("online");
    client.user.setPresence({
      game: {
        name: `Run "!bot" for commands`,
        type: "PLAYING",
      },
    });
  }
});
client.on("message", (message) => {
  if (message.content[0] === "!") {
    const command = message.content.split(" ")[0].substr(1);
    commands.handler(command, message);
  }
});

client.login(process.env.BOT_TOKEN);

server.listen(port, () => console.log(`\n*** Listening on port ${port}***\n`));
