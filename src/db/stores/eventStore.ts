import EventModel from "@db/models/Event.js";

export const eventStore = {
	async findAll() {
		return EventModel.find({ active: true });
	},
	async findById(eventId: string) {
		return EventModel.findOne({ eventId });
	},
	async create(data: object) {
		return EventModel.create(data);
	},
	async update(eventId: string, data: object) {
		return EventModel.findOneAndUpdate({ eventId }, { $set: data }, { new: true });
	},
	async delete(eventId: string) {
		return EventModel.findOneAndUpdate({ eventId }, { $set: { active: false } });
	},
};
