import { SlashCommandBuilder } from "discord.js";



export default {
  data: new SlashCommandBuilder().setName('rok-ruins-reminders').setDescription('configure reminders for RoK Ruins'),

  async execute(interaction: any) {
    await interaction.reply("Pong!");
  }
};
