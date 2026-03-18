import { Client, ClientOptions, Collection } from "discord.js";
import { ICommand } from "../types/ICommand";

// Extend the Client class to add the 'commands' property
export class MyClient extends Client {
    public commands: Collection<string, ICommand> = new Collection();

    constructor(options: ClientOptions) {
        super(options);
    }
}