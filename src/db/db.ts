import mongoose from "mongoose";
import { isDev, port, uri } from "@utils/config.js";

export async function connectMongoose(): Promise<void> {
	await mongoose.connect(uri);
	if (isDev) console.log(`\n*** Listening on port ${port}***\n`);
}
