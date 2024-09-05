import { Message}  from "discord.js";
import eightBall  from "./miscellaneous/eightBall";
import sunTzu  from "./miscellaneous/sunQoute";
import donate  from "./miscellaneous/donate";
import poll  from "./miscellaneous/poll";
import rps  from "./miscellaneous/rps";
import ping  from "./miscellaneous/ping";
import countdown  from "./miscellaneous/countdown";
import castle  from "./rokAssets/castle";
import upgrade  from "./rokAssets/cityHall";
import commander  from "./rokAssets/commander";
// import leaderBoard  from "./leaderBoard";
import { boiler }  from "./embed";

let description = "";
const commandsData = [
  commander,
  eightBall,
  sunTzu,
  upgrade,
  poll,
  donate,
  castle,
  rps,
  countdown,
  ping
  // leaderBoard,
].reduce((all, i) => {
  i.triggers.forEach((trigger) => (all[trigger] = i.handler));
  description += `**${i.name}** - ${i.description}\nUsage: ${i.triggers}\n\n`;
  return all;
}, {});

export const commands = {
  ...commandsData,
  bot: (message) =>message.channel.send({embed: { ...boiler, description }}),
};


export const runCommand = (message:Message) => {
  console.log('commands', commands)
    if (message.content[0] === "!") {
      const cmd = message.content.split(" ")[0].substr(1);
      if(commands[cmd]) commands[cmd]( message, cmd)
    }
}