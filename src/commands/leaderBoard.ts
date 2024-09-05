const axios = require("axios");
const { readImage } = require("./tessaract");
/**
 *
 *  
  This feature will take a screenshot of an image to read the 
  text on the image. 
  
  then save the data in a database and then be able to ranking them 
  based on how many points 

 */

module.exports = {
  name: "leaderboard",
  description:
    "Create an event for members to input data and get a leaderboard ranking on points.",
  triggers: ["leaderboard"],
  handler: async (message) => {
    const cmd = message.content;
    const user = {
      discordUserId: message.author.id,
      username: message.author.username,
      bot: message.author.bot,
      discordGuildId: message.guild.id,
    };
    const data = readImage(message.attachments);
    console.log("data", data);
    //   try {
    //     const response = await axios.post("/users", {
    //       user: user,
    //       data: attachmentText,
    //     });
    //     console.log("response", response);
    //   } catch (e) {
    //     console.log("error", e);
    // }
  },
};
