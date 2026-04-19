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
import { GuildSetupManager } from "@features/setup/GuildSetupManager.js";
import { registerChannelDeleteWatcher } from "@features/setup/ChannelDeleteWatcher.js";
import { botLogStore } from "@db/stores/botLogStore.js";
import { BOT_LOG_EVENTS } from "@base/constants/BOT_LOG_EVENTS.js";
import { refreshAllSchedules } from "@features/schedule/ScheduleBoard.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";

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
	const ADMIN_COMMANDS = new Set<string>(BOT_CONSTANTS.ADMIN_COMMANDS);

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
			} else console.warn(LOG_MESSAGES.main.commandLoadWarning(filePath));
		}
	}

	// step 2 - connect to db before starting the bot to ensure it's ready when commands are executed
	await connectMongoose();

	// step 3 - set up event listeners before logging in, to avoid missing any events that fire on startup (like guildCreate)
	client.on(Events.GuildCreate, async (guild) => {
		try {
			const alreadyBuilt = await guildConfigStore.findByGuildId(guild.id);
			if (alreadyBuilt?.setupComplete) return;

			const owner = await guild.fetchOwner();
			await GuildSetupManager.autoSetup(guild, { guildId: guild.id, ownerId: guild.ownerId });
			await owner.send({ embeds: [arrivalEmbed(guild.name, owner.id)] });
			await botLogStore.log(guild.id, BOT_LOG_EVENTS.INTRO_DM_SENT, { ownerId: guild.ownerId });
		} catch (error) {
			console.error(LOG_MESSAGES.main.autoSetupFailedLeaving(guild.id), error);
			try {
				await guild.leave();
			} catch (leaveError) {
				console.error(LOG_MESSAGES.main.leaveFailed(guild.id), leaveError);
			}
		}
	});
	// then register the interaction  listerner
	client.on(Events.InteractionCreate, async (interaction) => {
		// handle autocomplete interactions first, before command checks
		if (interaction.isAutocomplete()) {
			const command = client.commands.get(interaction.commandName);
			if (command?.autocomplete) await command.autocomplete(interaction);
			return;
		}

		if (!interaction.isChatInputCommand()) return;

		const command = client.commands.get(interaction.commandName);
		if (!command) {
			console.error(LOG_MESSAGES.main.noCommandMatch(interaction.commandName));
			return;
		}

		// ── admin role guard ───────────────────────────────────────────
		// skip for /setup — it has its own owner-only check
		if (interaction.commandName !== "setup") {
			const config = await guildConfigStore.findByGuildId(interaction.guildId!);

			if (ADMIN_COMMANDS.has(interaction.commandName)) {
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
				const hasAdminRole = (config.adminRoleId && member?.roles.cache.has(config.adminRoleId)) ?? false;

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
			console.error(LOG_MESSAGES.main.commandExecuteError(interaction.commandName), error);

			// interaction might already be replied to
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					embeds: [errorEmbed(embedContent.responses.commandExecuteFailure)],
					flags: MessageFlags.Ephemeral,
				});
			} else {
				await interaction.reply({
					embeds: [errorEmbed(embedContent.responses.commandExecuteFailure)],
					flags: MessageFlags.Ephemeral,
				});
			}
		}
	}); // start the scheduler after commands are loaded
	// && after client is ready (since it relies on the client to send messages)
	client.once(Events.ClientReady, async () => {
		// set bot presence
		client.user?.setPresence({ activities: [{ name: "⚔️ Watching over KvK" }], status: "online" });

		// start scheduler and activity tracker, and API server
		startScheduler(client);
		registerActivityListeners(client);
		startApiServer(client);

		// ── realtime homebase self heal ───────────────────────────
		// Registered BEFORE the ensureHomebase boot sweep below so the
		// gateway listener is live the moment the bot is ready. Pairs
		// with the boot sweep: realtime handles single channel deletions
		// as they happen; boot sweep catches anything that was deleted
		// while the bot was offline. See ChannelDeleteWatcher.ts for the
		// cooldown + ownership probe contract.
		registerChannelDeleteWatcher(client);

		// ── homebase self heal on wake up ──────────────────────────
		// What: every guild the bot is cached in gets an ensureHomebase pass.
		//       That method checks category presence + ownership, scans each
		//       of the six child channels, and rebuilds any that were deleted
		//       while the bot was offline. Missing single channels get a per
		//       channel audit notice posted to the inner sanctum; a fully
		//       missing category triggers a reconstruction plus a "castle
		//       rebuilt" embed in the new inner sanctum.
		// Who:  ensureHomebase lives on GuildSetupManager and centralizes the
		//       detect + rebuild logic so the runtime self heal in
		//       ScheduleBoard.postOrEdit and this boot time sweep follow the
		//       same provenance rules.
		// When: exactly once per process boot, right after the scheduler /
		//       activity / api server are up so anything ensureHomebase posts
		//       into the new schedule channel can be refreshed immediately by
		//       refreshAllSchedules below.
		// Where: the arrival DM only fires on "built" (first time construct).
		//        "rebuilt" and "repaired" are self narrating inside the inner
		//        sanctum, so re DMing the owner would be noise.
		// How:  ensureHomebase returns { action, repairedChannels }.
		//       "built" is the only branch that warrants the arrival DM, and
		//       even then we respect the INTRO_DM_SENT log so re running a
		//       build in edge cases (DB wipe but owner already greeted) does
		//       not double DM.
		for (const guild of client.guilds.cache.values()) {
			try {
				const result = await GuildSetupManager.ensureHomebase(client, guild);

				if (result.action === "built") {
					// first time build for this guild. preserve the original
					// arrival DM behavior, guarded by the existing bot log so
					// we never spam an owner we've already greeted.
					const alreadyIntroduced = await botLogStore.has(guild.id, BOT_LOG_EVENTS.INTRO_DM_SENT);
					if (!alreadyIntroduced) {
						const owner = await guild.fetchOwner();
						await owner.send({ embeds: [arrivalEmbed(guild.name, owner.id)] });
						await botLogStore.log(guild.id, BOT_LOG_EVENTS.INTRO_DM_SENT, { ownerId: guild.ownerId });
					}
				}
				// "rebuilt", "repaired", and "skipped" paths are handled
				// entirely inside ensureHomebase (which posts the castle /
				// per channel notices into the inner sanctum for the first
				// two). nothing else to do here.

				// ── intro embed refresh ───────────────────────────────
				// What: after ensureHomebase has confirmed (or rebuilt) the
				//       homebase for this guild, sweep the six stored intro
				//       messages and edit them in place so copy changes in
				//       embed-content.ts land on the next boot without
				//       forcing an admin to rebuild.
				// When: only after ensureHomebase finishes so we never edit
				//       a channel that was just deleted. A fresh "built"
				//       already wrote the latest copy so this call is a no
				//       op for that branch, but running it uniformly keeps
				//       the code path simple and the logs symmetric.
				// Where: failures here must not cancel the rest of the boot
				//        loop — swallow with a log so one guild cannot stall
				//        the others.
				try {
					await GuildSetupManager.refreshIntroEmbeds(client, guild);
				} catch (refreshError) {
					console.error(LOG_MESSAGES.main.autoSetupFailedSkipping(guild.id), refreshError);
				}
			} catch (error) {
				console.error(LOG_MESSAGES.main.autoSetupFailedSkipping(guild.id), error);
			}
		}

		// ── startup rehydration of the schedule board ──
		// What: refresh every guild's pinned schedule message so it reflects
		//       current state after any downtime.
		// Who:  every guild the bot is in, regardless of setup state. Guilds
		//       still mid autoSetup are no-ops inside refreshSchedule.
		// When: once per process lifecycle, right after auto setup sweeps and
		//       before we hand control over to the schedulers.
		// Where: pairs with the hourly safety tick inside startScheduler and
		//        the on-change triggers scattered across events.routes,
		//        ReminderJob, and GuildEventManager.
		// How:  iterates client.guilds.cache sequentially (alphabetical by
		//       guild id) so errors on one guild cannot stall the rest.
		await refreshAllSchedules(client);

		console.log(LOG_MESSAGES.main.readyBanner(client.user?.tag ?? "unknown"));
	});

	// login the bot after everything is set up
	await client.login(discordToken);
})();
