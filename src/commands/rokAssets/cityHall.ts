import { errorEmbed, formatEmbedCity }  from "../embed";
import { getCity }  from "../../data/rok_modal";

module.exports = {
  name: "City Hall Upgrades",
  description: "Learn information about city to level up",
  triggers: ["city"],
  handler: async (message) => {
    const msg = message.content.split(" ").pop();
    const level = await getCity(msg);
    if (level.length === 0) {
      return message.channel.send({ embed: errorEmbed() });
    }
    return message.channel.send({ embed: formatEmbedCity(level.pop()) });
  },
};
