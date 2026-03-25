import { Client, ClientOptions, Collection } from "discord.js";
import { ICommand } from "../types/ICommand.js";

// Extend the Client class to add the 'commands' property
export class MyClient implements Client {
    public commands: Collection<string, ICommand> = new Collection();

    constructor(options: ClientOptions) {
        super(options);
    }
}