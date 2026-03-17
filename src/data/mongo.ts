import mongoose from "mongoose";
import { port, uri } from "@utils/config.js";
// import { Express } from "express";
// import type { MongoError } from "mongodb";

export const connectMongoose = () =>
  mongoose.connect(uri).then(() => {
    console.log(`\n*** Listening on port ${port}***\n`);
  })
