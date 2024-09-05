// import { REST, Routes } from "discord.js";
// import { commands } from "./commands";
// import { port, botInviteLink, discordToken , clientId} from '@utils/config'

// const commandsData = Object.values(commands).map((command) => command.data);

// const rest = new REST({ version: "10" }).setToken(discordToken);



// export const deployCommands =async (guildId:string) => {
//   try {
//     console.log("Started refreshing application (/) commands.");

//     await rest.put(
//       Routes.applicationGuildCommands(clientId, guildId),
//       {body: commandsData}
//     );

//     console.log("Successfully reloaded application (/) commands.");
//   } catch (error) {
//     console.error(error);
//   }
// }