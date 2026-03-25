
// types/global.d.ts
declare module "discord.js" {
    import { Collection } from "discord.js";
    import { ICommand } from "@base/types/ICommand";

    interface Client {
        commands: Collection<string, ICommand>;
    }
}