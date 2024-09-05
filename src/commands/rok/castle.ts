import { formatEmbedCastle, errorEmbed, sendEmbed } from "../embed";
import { getCastle } from "@db/modal/getCastle";
import { notFound } from "@db/error.json";

export = {
	name: "Castle Upgrades",
	description: "Learn information about castle upgrades",
	triggers: ["castle"],
	handler: async (message) => {
		const msg = message.content.split(" ").pop();
		const level = await getCastle(parseInt(msg, 10));
		if (level.length === 0) return sendEmbed(message, notFound);
		const options = formatEmbedCastle(level.pop());
		return sendEmbed(message, options);
	},
};
