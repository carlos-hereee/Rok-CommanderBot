import { Message } from "discord.js";

export interface ICommand {
    data: string;
    handler: (message: Message, trigger?: string) => void;
}