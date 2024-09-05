
export= {
    name: "Play ping pong",
    description: "Play ping pong",
    triggers: ["ping", "pong"],
    handler: async (message, trigger) => {
        const reply = trigger ==="ping"? "pong":"ping"
   return message.channel.send(reply);
    },
  };
  