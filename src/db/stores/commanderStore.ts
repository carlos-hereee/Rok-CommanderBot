// import mongoose from "mongoose";
// import { v4 } from "uuid";

// const Schema = mongoose.Schema;
// const commanderSchema = new Schema<>(
//   {
//     eventId: { type: String, require: true, unique: true, default: v4 },
//     calendarId: { type: Schema.Types.ObjectId, ref: "Calendar", require: true },
//     hero: { type: String, ref: "Hero" },
//     date: { type: Schema.Types.Date, require: true },
//     frequency: { type: String, default: "" },
//     uid: { type: String, require: true, default: v4 },
//     name: { type: String, default: "" },
//     details: { type: String, default: "" },
//     startTime: { type: String, require: true },
//     endTime: { type: String, require: true },
//     isOpen: { type: Boolean, default: true },
//     attendees: [
//       {
//         uid: { type: String, require: true, default: v4 },
//         userId: { type: Schema.Types.ObjectId, ref: "Users" },
//         username: { type: String },
//         email: { type: String },
//         phone: { type: Number },
//       },
//     ],
//   },
//   { timestamps: true }
// );
// const Events = mongoose.model("Events", commanderSchema);
// export default Events;
