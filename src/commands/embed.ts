import {EmbedBuilder, Message, EmbedData} from "discord.js"
import {botInviteLink} from '@utils/config'

export const boiler =(options?:EmbedData)=>{
  if(options) return new EmbedBuilder({
  color: 0x3a8bdf,
  author: {name: "Silbas handbood",url: botInviteLink,},
  footer: {
    text: `This is a fanmade bot and it is not affiliated with Lilithgames in any way. Copyright © ${new Date().getFullYear()}`,
  },...options
}).setTimestamp()
   return new EmbedBuilder({
  color: 0x3a8bdf,
  author: {name: "Silbas handbood",url: botInviteLink,},
  footer: {
    text: `This is a fanmade bot and it is not affiliated with Lilithgames in any way. Copyright © ${new Date().getFullYear()}`,
  },
}).setTimestamp()}

export const formatEmbed = (embed) => {

  return { title: embed.name.toUpperCase(),
    description: embed.description,
    thumbnail: {
      url: embed.thumbnail,
    },
    image: {
      url: embed.build_url,
    },
    fields: [
      {
        name: "Other Commander Builds Include:",
        value: `!tree ${embed.name.toLowerCase()} ${embed.other_builds || " "}`,
        inline: true,
      },
    ],}

  };
export const errorEmbed = () => {
  return  boiler({
    description: "The command as you have typed does not exist in our database",
    image: {
      url:
        "https://www.filmla.com/wp-content/uploads/2016/04/travolta-404-comp.gif",
    },
  })
};
export const formatEmbedCity = (embed) => {
  return {
    description: embed.description,
    thumbnail: {
      url:
        "https://vignette.wikia.nocookie.net/riseofcivilizations/images/5/59/Building_City_Hall_1_5.png/revision/latest?cb=20181114154456",
    },
    fields: [
      {
        name: "Unlocks",
        value: embed.unlocks,
        inline: true,
      },
      {
        name: "Requirements",
        value: embed.requirements,
        inline: true,
      },
      {
        name: "Troop Capacity",
        value: embed.troop,
        inline: true,
      },
      {
        name: "Cost",
        value: embed.cost,
        inline: true,
      },
      {
        name: "Time",
        value: embed.time,
        inline: true,
      },
      {
        name: "Power",
        value: embed.power,
        inline: true,
      },
    ],
  }
};

export const formatEmbedCastle = (embed) => {
  return {
    description: embed.description,
    thumbnail: {
      url:
        "https://vignette.wikia.nocookie.net/riseofcivilizations/images/f/fd/Building_Castle_1_5.png/revision/latest/scale-to-width-down/180?cb=20181114154437",
    },
    fields: [
      {
        name: "Requirements",
        value: embed.requirements,
        inline: true,
      },
      {
        name: "Rally Capacity",
        value: embed.rally,
        inline: true,
      },
      {
        name: "Cost",
        value: embed.cost,
        inline: true,
      },
      {
        name: "Time",
        value: embed.time,
        inline: true,
      },
      {
        name: "Power",
        value: embed.power,
        inline: true,
      },
    ],
  };
};



export const sendEmbed = (message: Message, options?:EmbedData)=>{
    const emebed = boiler(options)
  return   message.reply({embeds:[emebed]})
}