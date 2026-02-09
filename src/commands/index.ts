// import { Message } from "discord.js";
// import { Routes } from "discord-api-types/v10";
// // import { commandsData } from "./getCmd";

// // import { commands } from "./commands";
// import { port, botInviteLink, discordToken, clientId } from "@utils/config";

// // const commandsData = Object.values(commands).map((command) => command.data);

// const rest = new REST({ version: "10" }).setToken(discordToken);

// export const deployCommands = async (guildId: string) => {
//   try {
//     console.log("Started refreshing application (/) commands.");

//     await rest
//       .put
//       //   Routes.applicationGuildCommands(clientId, guildId),
//       //   {body: commandsData}
//       ();

//     console.log("Successfully reloaded application (/) commands.");
//   } catch (error) {
//     console.error(error);
//   }
// };

// export const commands = {
//   // ...commandsData,
// };

// export const runCommand = (message: Message) => {
//   console.log("\n\nmessage ==>", message, "\n\n");
//   // if (message.content[0] === "!") {
//   // 	// const cmd = message.content.split(" ")[0].substr(1);
//   // 	// if (commands[cmd]) commands[cmd](message, cmd);
//   // }
// };
