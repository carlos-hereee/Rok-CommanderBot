import mongoose from "mongoose";
import { uri } from "@utils/config.js";

export async function connectMongoose(): Promise<void> {
	if (!uri) {
		console.error("[ERROR] MONGOOSE_URI environment variable is not set.");
		process.exit(1);
	}

	await mongoose.connect(uri);
	console.log("\n\n✅ Connected to MongoDB");
}
