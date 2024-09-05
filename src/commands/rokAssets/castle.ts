const { formatEmbedCastle, errorEmbed } = require("../embed");
const { getCastle } = require("../../data/rok_modal");

module.exports = {
  name: "Castle Upgrades",
  description: "Learn information about castle upgrades",
  triggers: ["castle"],
  handler: async (message) => {
    const msg = message.content.split(" ").pop();
    const level = await getCastle(msg);
    if (level.length === 0) {
      return message.channel.send({ embed: errorEmbed() });
    }
    return message.channel.send({ embed: formatEmbedCastle(level.pop()) });
  },
};
