import eightBall  from "./miscellaneous/eightBall";
import sunTzu  from "./miscellaneous/sunQoute";
import donate  from "./miscellaneous/donate";
import poll  from "./miscellaneous/poll";
import rps  from "./miscellaneous/rps";
import countdown  from "./miscellaneous/countdown";
import castle  from "./rokAssets/castle";
import upgrade  from "./rokAssets/cityHall";
import commander  from "./rokAssets/commander";
// import leaderBoard  from "./leaderBoard";
import { boiler }  from "./embed";

let description = "";
const cmd = [
  commander,
  eightBall,
  sunTzu,
  upgrade,
  poll,
  donate,
  castle,
  rps,
  countdown,
  // leaderBoard,
].reduce((all, i) => {
  i.triggers.forEach((trigger) => (all[trigger] = i.handler));
  description += `**${i.name}** - ${i.description}\nUsage: ${i.triggers}\n\n`;
  return all;
}, {});
const commands = {
  ...cmd,
  bot: (message) =>
    message.channel.send({
      embed: { ...boiler, description: description },
    }),
};

export = {
  handler: (command, message) => {
    if (message.author.bot) return;
    if (command && commands[command]) commands[command](message);
  },
};
