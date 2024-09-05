import { formatEmbed, errorEmbed }  from "../embed";
import { getCommander }  from "../../data/rokModal";

const builds = {
  skill: "SKILL",
  garrison: "GARRISON",
  leadership: "LEADERSHIP",
  city: "CITY",
  cavalry: "CAVALRY",
};

export = {
  name: "Commanders",
  description: "Optimal builds for a commander in Rise of Kingdoms",
  triggers: ["tree"],
  handler: async (message) => {
    const msg = message.content.split(" ").slice(1);
    let champion = "";
    let build = "";
    if (!builds[msg[msg.length - 1]]) {
      champion = msg.join(" ").toUpperCase();
      build = "null";
    } else {
      build = msg[msg.length - 1].toUpperCase();
      msg.pop();
      champion = msg.join(" ").toUpperCase();
    }
    console.log('msg', msg)
    const commander = await getCommander(champion, build);
    console.log('commander', commander)
    if (commander.length === 0) {
      const options ={
        description: "The command as you have typed does not exist in our database",
        image: {
          url:
            "https://www.filmla.com/wp-content/uploads/2016/04/travolta-404-comp.gif",
        },
      }
      return sendEmbed(message, options)
    }
    const options = formatEmbed(commander.pop())
    return sendEmbed(message, options)
  },
};
