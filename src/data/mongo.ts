import mongoose from "mongoose";
import { port, uri } from "@utils/config.js";
import { Express } from "express";
// import type { MongoError } from "mongodb";

export const connectMongoose = (server: Express) =>
  mongoose.connect(uri).then(() => {
    server.listen(port, () => console.log(`\n*** Listening on port ${port}***\n`));
  });
