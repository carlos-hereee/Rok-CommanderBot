import mongoose from "mongoose";
import { uri } from "@utils/config.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";

export async function connectMongoose(): Promise<void> {
	if (!uri) {
		console.error(LOG_MESSAGES.db.missingUri);
		process.exit(1);
	}

	await mongoose.connect(uri);
	console.log(LOG_MESSAGES.db.connected);
}
