import { Message}  from "discord.js";

export interface ICommand {
name:string; 
description:string; 
triggers:string[]; 
handler:(message:Message,trigger?: string)=>void; 
}