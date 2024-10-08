const prediction = [
  "It is certain",
  "It is decidedly so",
  "Without a doubt",
  "Yes definitely",
  "You may rely on it",
  "As I see it, yes",
  "Most likely",
  "Outlook good",
  "Yes",
  "Signs point to yes",
  "Reply hazy try again",
  "Ask again later",
  "Better not tell you now",
  "Cannot predict now",
  "Concentrate and ask again",
  "Don't count on it",
  "My reply is no",
  "My sources say no",
  "Outlook not so good",
  "Very doubtful",
];

export = {
  name: "8 Ball",
  triggers: [`ball`, "8ball"],
  description: "Get mystical predictions for a yes or no question.",
  handler: (message) => {
    const answer = prediction[Math.floor(Math.random() * prediction.length)];
    return message.channel.send(`${message.author} ${answer} 🎱`);
  },
};
