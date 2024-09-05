
import { sendEmbed}  from "./embed";


export= {
    name: "Bot help",
    description: "Display all bots commands",
    triggers: ["bothelp"],
    handler: async (message, trigger) => {
        (message:Message) =>sendEmbed(message)
    },
  };
  