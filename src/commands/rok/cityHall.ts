import { errorEmbed, formatEmbedCity, sendEmbed }  from "../embed";
import { getCity }    from "@db/modal/getCity";
import { notFound }  from "@db/error.json";

export = {
  name: "City Hall Upgrades",
  description: "Learn information about city to level up",
  triggers: ["city"],
  handler: (message) => {
    const msg = message.content.split(" ").pop();
    const level =  getCity(parseInt(msg,10));
    if (level.length === 0) return sendEmbed(message, notFound)
      const options = formatEmbedCity(level.pop())
    return sendEmbed(message, options)
  },
};
