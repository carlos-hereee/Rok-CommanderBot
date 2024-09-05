import { formatEmbedCastle, errorEmbed }  from "../embed";
import { getCastle }  from "../../data/rok_modal";

export= {
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
