const Tesseract = require("tesseract.js");
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
    const { id, username, bot } = message.author;
    let url = [];

    message.attachments.forEach((attachment) => {
      const img = attachment.proxyURL;
      url.push(img);
    });
    if (!url.length) {
      //  if no image tell user to attach image
      return message.reply("Please attach an image with the command");
    }
    if (url.length === 1) {
      Tesseract.recognize(url[0], "eng", {
        logger: (tessa) => {
          const { status, progress } = tessa;
        },
      }).then(({ data: { text } }) => {
        console.log("text", text);
      });
    }
  },
};
