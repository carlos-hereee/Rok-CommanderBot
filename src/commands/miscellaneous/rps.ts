const choices = ["rock", "paper", "scissors"];

const results = [
  ["t", "c", "u"],
  ["u", "t", "c"],
  ["c", "u", "t"],
];

const resultMap = {
  t: "It is a Tie!",
  u: "You Win!",
  c: "You Lose!",
};

module.exports = {
  name: "Rock, Paper, Scissors",
  triggers: ["game"],
  description: "Play a fun game with the bot of rock paper scissors",
  handler: (message) => {
    const cpu = choices[Math.floor(Math.random() * choices.length)]; // generate random choice for computer
    const msg = message.content.toLowerCase().split(" "); // get the choice of the user
    const pc = msg[msg.length - 1];
    const userChoiceIndex = choices.indexOf(pc); // get the index of user's choice
    const computerChoiceIndex = choices.indexOf(cpu);
    const userResult = results[computerChoiceIndex][userChoiceIndex]; // get resutls

    const rps = {
      color: 0xf66108,
      title: "Rock, Paper, Scizzors",
      author: {
        name: `Lets Play`,
        icon_url:
          "https://miro.medium.com/max/2000/1*FEcr9_owB5KplrClDpRenA.png",
      },
      description: `${message.author} plays ${pc}\n\n while computer plays, ${cpu}\n\nResults: ${resultMap[userResult]}\n\nThank you for playing.`,
      thumbnail: {
        url: "https://miro.medium.com/max/2000/1*FEcr9_owB5KplrClDpRenA.png",
      },
    };
    return message.channel.send({ embed: rps });
  },
};
