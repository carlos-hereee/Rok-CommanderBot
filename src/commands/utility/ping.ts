import { SlashCommandBuilder } from "discord.js";



export default {
  // name: "Play ping pong",
  // description: "Play ping pong",
  data: new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),

  // triggers: ["ping", "pong"],
  async execute(interaction: any) {
    // const reply = interaction.commandName ==="ping"? "pong":"ping"
    await interaction.reply("Pong!");
  }
};
