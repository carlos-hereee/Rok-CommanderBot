import { GatewayIntentBits, Collection, Events, MessageFlags, Client, Partials } from "discord.js";
import { discordToken } from "@utils/config.js";
import clientReady from "@commands/utility/ready.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { startScheduler } from "@features/reminders/ReminderScheduler.js";
import { connectMongoose } from "@db/db.js";
import { registerActivityListeners } from "@features/activity-tracking/ActivityTracker.js";
import { startApiServer } from "@api/server.js";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { arrivalEmbed, errorEmbed } from "@utils/embedBuilder.js";
import { embedContent } from "@base/constants/embed-content.js";
import { BOT_CONSTANTS } from "@base/constants/BOT_CONSTANTS.js";

// paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers, // ← needed for member data
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildVoiceStates, // ← needed for VoiceStateUpdate
		GatewayIntentBits.GuildPresences, // ← needed for PresenceUpdate
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessageReactions, // ← needed for MessageReactionAdd
	],
	// Discord only sends full data for recent messages.
	// For older messages it sends a "partial" — an incomplete object with just the ID.
	//  Without declaring `Partials.Message`, `Partials.Reaction`, and `Partials.User`,
	// reactions on reminder messages that are more than a few minutes old will be silently ignored,
	//  and `reaction.fetch()` in the listener won't work correctly.
	partials: [
		Partials.Message, // ← needed to catch reactions on older messages
		Partials.Reaction, // ← needed to catch reactions on older messages
		Partials.User,
	],
});

clientReady(client);

// load commands first
(async () => {
	// step 1 - load commands
	client.commands = new Collection();
	const foldersPath = path.join(__dirname, "commands");
	const commandFolders = fs.readdirSync(foldersPath);

	// command loader loop
	for (const folder of commandFolders) {
		const commandsPath = path.join(foldersPath, folder);
		const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js") || file.endsWith(".cjs"));
		for (const file of commandFiles) {
			const filePath = path.join(commandsPath, file);
			const commandModule = await import(pathToFileURL(filePath).href);
			const command = commandModule.default ?? commandModule; // handles both cases

			if ("data" in command && "execute" in command) {
				client.commands.set(command.data.name, command);
			} else console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}

	// step 2 - connect to db before starting the bot to ensure it's ready when commands are executed
	await connectMongoose();

	// step 3 - set up event listeners before logging in, to avoid missing any events that fire on startup (like guildCreate)
	client.on(Events.GuildCreate, async (guild) => {
		try {
			// check if already set up — handles bot being removed and re-added
			const alreadySetup = await guildConfigStore.isSetupComplete(guild.id);
			if (alreadySetup) return;

			// fetch the owner so we can DM them
			const owner = await guild.fetchOwner();
			await owner.send({ embeds: [arrivalEmbed(guild.name, owner.id)] });
		} catch (error) {
			console.error("GuildCreate handler error:", error);
		}
	});

	// then register the interaction  listerner
	client.on(Events.InteractionCreate, async (interaction) => {
		if (!interaction.isChatInputCommand()) return;

		const command = client.commands.get(interaction.commandName);
		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		// ── admin role guard ───────────────────────────────────────────
		// skip for /setup — it has its own owner-only check
		if (interaction.commandName !== "setup") {
			const config = await guildConfigStore.findByGuildId(interaction.guildId!);

			if (BOT_CONSTANTS.ADMIN_COMMANDS.has(interaction.commandName)) {
				// guild hasn't run /setup yet — no config means no admin role is defined
				if (!config) {
					await interaction.reply({
						embeds: [errorEmbed(embedContent.responses.setupRequired)],
						flags: MessageFlags.Ephemeral,
					});
					return;
				}

				const member = interaction.guild?.members.cache.get(interaction.user.id);
				const isOwner = interaction.user.id === interaction.guild?.ownerId;
				const hasAdminRole = member?.roles.cache.has(config.adminRoleId) ?? false;

				if (!isOwner && !hasAdminRole) {
					await interaction.reply({
						embeds: [errorEmbed(embedContent.responses.noWizardPowers)],
						flags: MessageFlags.Ephemeral,
					});
					return;
				}
			}
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(`Error executing ${interaction.commandName}:`, error);

			// interaction might already be replied to
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					embeds: [errorEmbed("Something went wrong executing this command.")],
					flags: MessageFlags.Ephemeral,
				});
			} else {
				await interaction.reply({
					embeds: [errorEmbed("Something went wrong executing this command.")],
					flags: MessageFlags.Ephemeral,
				});
			}
		}
	}); // start the scheduler after commands are loaded
	// && after client is ready (since it relies on the client to send messages)
	client.once(Events.ClientReady, () => {
		// set bot presence
		client.user?.setPresence({ activities: [{ name: "⚔️ Watching over KvK" }], status: "online" });

		// start scheduler and activity tracker, and API server
		startScheduler(client);
		registerActivityListeners(client);
		startApiServer();
		console.log(
			"====================================\n" +
				`🤖 ${client.user?.tag} is online and operational!\n` +
				"===================================="
		);
	});

	// login the bot after everything is set up
	await client.login(discordToken);
})();
