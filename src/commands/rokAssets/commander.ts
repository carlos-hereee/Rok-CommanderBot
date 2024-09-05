const { formatEmbed, errorEmbed } = require("../embed");
const { getCommander } = require("../../data/rok_modal");

const builds = {
  skill: "SKILL",
  garrison: "GARRISON",
  leadership: "LEADERSHIP",
  city: "CITY",
  cavalry: "CAVALRY",
};

module.exports = {
  name: "Commanders",
  description: "Optimal builds for a commander in Rise of Kingdoms",
  triggers: ["tree"],
  handler: async (message) => {
    const msg = message.content.split(" ").slice(1);
    let champion = "";
    let build = "";
    if (!builds[msg[msg.length - 1]]) {
      champion = msg.join(" ").toUpperCase();
      build = null;
    } else {
      build = msg[msg.length - 1].toUpperCase();
      msg.pop();
      champion = msg.join(" ").toUpperCase();
    }
    const commander = await getCommander(champion, build);
    if (commander.length === 0) {
      return message.channel.send({ embed: errorEmbed() });
    }
    return message.channel.send({ embed: formatEmbed(commander.pop()) });
  },
};
