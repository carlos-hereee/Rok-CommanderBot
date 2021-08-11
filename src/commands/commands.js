const eightBall = require("./miscellaneous/eightBall");
const sunTzu = require("./miscellaneous/sunQoute");
const donate = require("./miscellaneous/donate");
const poll = require("./miscellaneous/poll");
const rps = require("./miscellaneous/rps");
const countdown = require("./miscellaneous/countdown");
const castle = require("./rokAssets/castle");
const upgrade = require("./rokAssets/cityHall");
const commander = require("./rokAssets/commander");
// const leaderBoard = require("./leaderBoard");
const { boiler } = require("./embed");

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

module.exports = {
  handler: (command, message) => {
    if (message.author.bot) return;
    if (command && commands[command]) commands[command](message);
  },
};
