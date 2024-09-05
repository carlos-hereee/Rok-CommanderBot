import { Message } from "discord.js";
import type { ICommand } from "@utils/types/ICommand";
import eightBall from "./miscellaneous/eightBall";
import sunTzu from "./miscellaneous/sunQoute";
import donate from "./miscellaneous/donate";
import poll from "./miscellaneous/poll";
import rps from "./miscellaneous/rps";
import ping from "./miscellaneous/ping";
import countdown from "./miscellaneous/countdown";
// import bothelp  from "./miscellaneous/bothelp";
import castle from "./rok/castle";
import upgrade from "./rok/cityHall";
import commander from "./rok/commander";
// import leaderBoard  from "./leaderBoard";
import { boiler, sendEmbed } from "./embed";

let description = "";
const commandsData = [
	// bothelp,
	rps,
	commander,
	eightBall,
	sunTzu,
	upgrade,
	poll,
	donate,
	castle,
	countdown,
	ping,
	// leaderBoard,
].reduce((all, i) => {
	i.triggers.forEach((trigger) => (all[trigger] = i.handler));
	description += `**${i.name}** - ${i.description}\nUsage: ${i.triggers}\n\n`;
	return all;
}, {});

export const commands = {
	...commandsData,
	bothelp: (message: Message) => sendEmbed(message, { description }),
};

export const runCommand = (message: Message) => {
	if (message.content[0] === "!") {
		const cmd = message.content.split(" ")[0].substr(1);
		if (commands[cmd]) commands[cmd](message, cmd);
	}
};
