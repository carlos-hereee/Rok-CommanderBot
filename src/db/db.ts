import mongoose from "mongoose";
import { uri } from "@utils/config.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";

export async function connectMongoose(): Promise<void> {
	if (!uri) {
		console.error(LOG_MESSAGES.db.missingUri);
		process.exit(1);
	}

	// Surface connection-lifecycle transitions. Registered before connect so the
	// very first reconnect after a dropped Atlas link is logged. Mongoose handles
	// the actual reconnection; we only make it observable.
	mongoose.connection.on("disconnected", () => console.warn(LOG_MESSAGES.db.disconnected));
	mongoose.connection.on("reconnected", () => console.log(LOG_MESSAGES.db.reconnected));
	mongoose.connection.on("error", (err) => console.error(LOG_MESSAGES.db.connectionError, err));

	// Explicit pool + timeout instead of relying on driver defaults: maxPoolSize
	// caps concurrent sockets to Atlas (the per-minute scheduler now fans out up
	// to SCHEDULER_GUILD_CONCURRENCY reads at once), and serverSelectionTimeoutMS
	// makes a boot-time connection problem fail fast and loud rather than hanging
	// the process indefinitely.
	await mongoose.connect(uri, {
		maxPoolSize: 20,
		serverSelectionTimeoutMS: 10_000,
	});
	console.log(LOG_MESSAGES.db.connected);
}

// Close the Mongoose connection cleanly. Called from main.ts' graceful-shutdown
// handler so an in-flight write has a chance to flush before the process exits.
export async function disconnectMongoose(): Promise<void> {
	console.log(LOG_MESSAGES.db.disconnecting);
	await mongoose.disconnect();
}
