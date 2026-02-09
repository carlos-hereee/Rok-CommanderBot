import { Client, Events } from "discord.js";

export default (client: Client): void => {
  client.on(Events.ClientReady, (readyClient) => {
    if (!client.user || !client.application) return;
    console.log(`\n\nLogged in as ${readyClient.user.tag}!\n`);
    console.log("\n\nreadyClient ==>", readyClient, "\n\n");
    // readyClient.channels.
  });
};
// client.on("ready", () => {
//   if (!client.user) return;
//   if (isDev) console.log(`\n*** ${client.user.username} is ready`);
//   client.user.setStatus("online");
//   client.user.setPresence({
//     afk: false,
//     activities: [{ name: "Run !bothelp for commands" }],
//   });
// });
