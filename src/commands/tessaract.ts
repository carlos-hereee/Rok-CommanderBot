import Tesseract  from "tesseract.js";

const readImage = async (attachments) => {
  let url = [];
  attachments.forEach((item) => {
    const img = item.proxyURL;
    url.push(img);
  });
  if (!url.length) {
    //  if no image tell user to attach image
    return message.reply("Please attach an image with the command");
  }

  return Tesseract.recognize(url[0], "eng").then(({ data: { text } }) => {
    console.log("data", text);
    // return text;
  });
};

module.exports = { readImage };
