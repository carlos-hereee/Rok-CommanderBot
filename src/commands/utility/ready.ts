import { Client, Events } from "discord.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";

export default (client: Client): void => {
	// When the client is ready, run this code (only once).
	// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
	// It makes some properties non-nullable.
	client.once(Events.ClientReady, (readyClient) => {
		console.log(LOG_MESSAGES.ready.loggedInAs(readyClient.user.tag));
	});
};
