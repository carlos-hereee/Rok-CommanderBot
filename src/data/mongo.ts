import mongoose from "mongoose";
import { uri } from "@utils/config";
// import type { MongoError } from "mongodb";

// mongoose no longer requires these options
// const dbOptions = { useNewUrlParser: true, useUnifiedTopology: true };

export const connectMongoose =  () => mongoose.connect(uri);
