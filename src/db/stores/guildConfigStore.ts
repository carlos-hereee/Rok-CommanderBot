import GuildConfigModel from "@db/models/GuildConfig.js";

export const guildConfigStore = {
	async findByGuildId(guildId: string) {
		return GuildConfigModel.findOne({ guildId });
	},

	async create(data: object) {
		return GuildConfigModel.create(data);
	},

	async update(guildId: string, data: object) {
		return GuildConfigModel.findOneAndUpdate({ guildId }, { $set: data }, { new: true });
	},

	async isSetupComplete(guildId: string): Promise<boolean> {
		const config = await GuildConfigModel.findOne({ guildId });
		return config?.setupComplete ?? false;
	},
};
