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

	// Delete this bot's GuildConfig for a guild. Used by the homebase stale
	// recovery path in ScheduleBoard when we detect the stored channels or
	// schedule message were authored by a different bot (rotated token, data
	// seeded from a sibling environment, or an earlier shared-DB era). After
	// this deletion GuildSetupManager.autoSetup can build a fresh homebase.
	async deleteByGuildId(guildId: string) {
		return GuildConfigModel.deleteOne({ guildId });
	},
};
