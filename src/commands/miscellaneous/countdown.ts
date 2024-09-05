const { Timer } = require("easytimer.js");
const embeds = require("./embed.js");

const getArgs = (msg, cmd) => {
  const command = msg.content;
  const args = command.slice(command.indexOf(cmd) + cmd.length);
  return args;
};

module.exports = {
  name: "Count Down",
  description:
    "A timer for important events: => !cd event_name [number]d [number]h [number]m ",
  triggers: ["cd"],
  handler: (message) => {
    const commandRecd = "cd ";
    const args = getArgs(message, commandRecd).split(" ");
    const title = args.shift();
    const hours = 0;
    const minutes = 0;
    const seconds = 0;

    for (let i = 0; i < args.length; i++) {
      let regx = /(\d*)d|(\d*)h|(\d*)m|(\d*)s/g; // THIS IS LITERALLY BLACK MAGIC DO NOT TOUCH
      const arg = args[i];
      let times = arg.match(regx);
      times &&
        times.forEach((x) => {
          let end = x.charAt(x.length - 1);
          if (end === "d") {
            hours = x.slice(0, x.length - 1);
            return;
          }
          if (end === "h") {
            minutes = x.slice(0, x.length - 1);
            return;
          }
          if (end === "m") {
            seconds = x.slice(0, x.length - 1);
            return;
          }
        });
    }
    const timer = new Timer();
    timer.start({
      countdown: true,
      target: [0, 0, 0, 0, 0],
      startValues: {
        seconds: seconds * 60,
        minutes: minutes * 60,
        hours: hours * 24,
      },
      precision: "minutes", // TODO: does not handle small amounts of time well. eg 3h 25mins etc
    });
    let embedmsg;
    message.channel
      .send({ embed: embeds(hours, minutes, seconds, title) })
      .then((m) => (embedmsg = m));
    timer.addEventListener("hoursUpdated", () => {
      embedmsg.edit({ embed: embeds(hours, minutes, seconds, title) });
    });
    timer.addEventListener("daysUpdated", () => {
      embedmsg.edit({ embed: embeds(hours, minutes, seconds, title) });
    });
    timer.addEventListener("targetAchieved", () => {
      message.reply(`The reminder titled \`${title}\` has finished!`);
    });
  },
};
