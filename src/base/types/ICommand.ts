
// Define the type for your command
export interface ICommand {
    data: any; // Replace 'any' with the proper type for your command data
    execute: (interaction: any) => Promise<void>; // Replace 'any' with proper interaction type
}
