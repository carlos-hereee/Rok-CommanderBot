import { Collection } from "discord.js";
import { ICommand } from "@base/types/ICommand";

// declation merging to add 'commands' to the Client type from discord.js
// this file tells typescript Client has a 'commands' property
declare module "discord.js" {
    interface Client {
        // this adds 'commands' to discord.js's own Client type
        // so TypeScript stops complaining about client.commands not existing
        commands: Collection<string, ICommand>;
    }
}