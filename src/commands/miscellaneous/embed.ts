// EMBED
let { RichEmbed } = require("discord.js");
module.exports = function genEmbed(days, hours, minutes, Title) {
  let embed = new RichEmbed()
    .setFooter("Countdown bot ")
    .setColor("#FF0000")
    .setTimestamp()
    .setTitle(Title)
    .setDescription(
      `Time left - **${days} day(s)**, **${hours} hour(s)**, **${minutes} minute(s)**`
    )
    .setAuthor(`Timer started `);
  return embed;
};
