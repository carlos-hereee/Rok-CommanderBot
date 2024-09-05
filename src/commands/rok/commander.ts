import { formatEmbed, errorEmbed , sendEmbed}  from "../embed";
import { getCommander }  from "@db/modal/getCommander";
import { notFound }  from "@db/error.json";

const builds = {
  skill: "SKILL",
  garrison: "GARRISON",
  leadership: "LEADERSHIP",
  city: "CITY",
  cavalry: "CAVALRY",
};

export = {
  name: "Commanders skill trees",
  description: "Optimal builds for a commander in Rise of Kingdoms",
  triggers: ["tree"],
  handler: async (message) => {
      const msg = message.content.split(" ").slice(1);
      let champion = "";
      let build = null;
      if (!builds[msg[msg.length - 1]])champion = msg.join(" ")
       else {
            build = msg[msg.length - 1]
            msg.pop();
            champion = msg.join(" ")
          }
          const commander = await getCommander(champion, build);
          if (commander.length === 0)return sendEmbed(message, notFound)
          const options = formatEmbed(commander.pop())
          return sendEmbed(message, options)
              },
            };
            