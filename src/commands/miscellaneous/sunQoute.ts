const sunTzu = require("sun-tzu-quotes");

module.exports = {
  name: "Sun Tzu Quotes",
  triggers: ["wise"],
  description: "Give you famous qoutes from the famous hero Sun Tzu",
  handler: (message) => {
    return message.channel.send(`Sun Tzu once said, \n\n${sunTzu()}`);
  },
};
