const donate = {
  color: 0x008f11,
  title: "Donation Info",
  description:
    "Thank you for wanting to help the developer.\n\n Consider joining my " +
    "[Patreon](https://www.patreon.com/silent_hero)",
};

module.exports = {
  name: "Donate",
  description: "Donations are not expected but are appreciated. ",
  triggers: ["donate"],
  handler: (message) => {
    return message.channel.send({ embed: donate });
  },
};
