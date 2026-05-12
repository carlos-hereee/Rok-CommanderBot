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
import { postFeatureAnnouncements } from "@features/announcements/postFeatureAnnouncement.js";
import { registerOutageWatcher } from "@features/observability/outageWatcher.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";
import { dispatchButton, dispatchModal } from "@handlers/interactionRegistry.js";
import { registerDecreeEditHandlers } from "@features/schedule/decreeEditHandlers.js";
import { registerLeaderboardChannelHandlers } from "@features/leaderboard/leaderboardChannelHandlers.js";
import { refreshAllNextUp } from "@features/schedule/NextUpBoard.js";

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
	//
	// guildCreate handles three distinct re-entries:
	//   ① brand new install: no GuildConfig row at all → autoSetup
	//      builds the homebase from scratch + DM the owner.
	//   ② re-install after a wipe: GuildConfig row exists with
	//      setupComplete=true, but the user kicked the bot, deleted
	//      the category/channels, and re-invited. The DB still says
	//      "all good" but Discord side is empty. We need to rebuild.
	//      Without this branch, the bot would silently no-op on
	//      re-invite and the owner would think self-heal was broken.
	//   ③ partial re-install: row exists but setupComplete=false
	//      (rare; usually means an earlier autoSetup crashed mid-way).
	//      Treat the same as ① and run autoSetup.
	//
	// ensureHomebase is the right tool for ②: it checks the stored
	// category id against Discord, falls through to rebuildFromStaleConfig
	// when the category is gone, and posts a "castle rebuilt" notice in
	// the new inner sanctum. It's idempotent, so calling it on every
	// guildCreate is safe even when the homebase is already healthy.
	client.on(Events.GuildCreate, async (guild) => {
		try {
			const alreadyBuilt = await guildConfigStore.findByGuildId(guild.id);

			// ② re-install after a wipe. Hand off to ensureHomebase
			// instead of short-circuiting. ensureHomebase will detect
			// the missing category, run rebuildFromStaleConfig, and
			// post the recovery notice. We do NOT re-DM the owner here
			// because the INTRO_DM_SENT log is still set from the
			// original install — re-DMing on every re-invite would be
			// noise.
			if (alreadyBuilt?.setupComplete) {
				await GuildSetupManager.ensureHomebase(client, guild);
				return;
			}

			// ① + ③ first-time or partial install.
			const owner = await guild.fetchOwner();
			await GuildSetupManager.autoSetup(guild, { guildId: guild.id, ownerId: guild.ownerId });
			await owner.send({ embeds: [arrivalEmbed(guild.name, owner.id)] });
			await botLogStore.log(guild.id, BOT_LOG_EVENTS.INTRO_DM_SENT, { ownerId: guild.ownerId });
		} catch (error) {
			// Do NOT leave the guild on autoSetup failure. The bot stays in the
			// guild so ensureHomebase can self-heal on the next boot via the
			// rebuild paths. Leaving was the old behavior — it forced owners to
			// re-invite manually after any transient failure (Discord 5xx, rate
			// limit, mid-build disconnect), which is harsher than the partial
			// install state ensureHomebase already knows how to recover from.
			console.error(LOG_MESSAGES.main.autoSetupFailed(guild.id), error);
		}
	});
	// register persistent button + modal handlers BEFORE the listener
	// installs. Each register* call is idempotent at module level — the
	// registry throws if the same prefix gets registered twice, which
	// surfaces a duplicate-bootstrap bug at boot rather than at the first
	// click. Add new handler registrations here as new persistent UIs ship.
	registerDecreeEditHandlers();
	registerLeaderboardChannelHandlers();

	// then register the interaction  listerner
	client.on(Events.InteractionCreate, async (interaction) => {
		// handle autocomplete interactions first, before command checks
		if (interaction.isAutocomplete()) {
			const command = client.commands.get(interaction.commandName);
			if (command?.autocomplete) await command.autocomplete(interaction);
			return;
		}

		// ── persistent button dispatch ──
		// What:  routes button clicks (Edit on a NextUpBoard post, etc) to
		//        the registered handler in interactionRegistry.
		// When:  every Discord ButtonInteraction. A `false` return from
		//        dispatchButton means no global handler matched — that's
		//        the expected case for buttons consumed by an inline
		//        awaitMessageComponent collector inside a slash command
		//        (configure-rok-reminders, the apply-scope flow inside
		//        decreeEditHandlers, etc). Both listeners receive the
		//        same InteractionCreate event; whichever has a matching
		//        handler acks the interaction.
		// Where: handlers register their prefix at boot (registerDecreeEdit
		//        Handlers above). Per-handler permission gates live inside
		//        the handler — the dispatcher does not authorize.
		if (interaction.isButton()) {
			try {
				await dispatchButton(interaction);
			} catch (error) {
				console.error(`[interactions] button handler threw for customId='${interaction.customId}'`, error);
				if (!interaction.replied && !interaction.deferred) {
					await interaction
						.reply({
							embeds: [errorEmbed(embedContent.responses.commandExecuteFailure)],
							flags: MessageFlags.Ephemeral,
						})
						.catch(() => undefined);
				}
			}
			return;
		}

		// ── persistent modal dispatch ──
		// Same dispatch model as buttons. Modals submitted by an inline
		// awaitModalSubmit collector (configure-rok-reminders' checklist
		// modal) flow through here too; dispatchModal returns false and
		// the inline collector handles the submit.
		if (interaction.isModalSubmit()) {
			try {
				await dispatchModal(interaction);
			} catch (error) {
				console.error(`[interactions] modal handler threw for customId='${interaction.customId}'`, error);
				if (!interaction.replied && !interaction.deferred) {
					await interaction
						.reply({
							embeds: [errorEmbed(embedContent.responses.commandExecuteFailure)],
							flags: MessageFlags.Ephemeral,
						})
						.catch(() => undefined);
				}
			}
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
		// set bot presence. Activity name is the bot's status line under
		// its username in the member list. Default activity type is
		// Watching, so this renders as "Watching 🎙️ Tuning the realm".
		client.user?.setPresence({ activities: [{ name: "🎙️ Tuning the realm" }], status: "online" });

		// start scheduler and activity tracker, and API server
		startScheduler(client);
		registerActivityListeners(client);
		startApiServer(client);

		// ── outage watcher ────────────────────────────────────────
		// Polls serverApi reachability state every 60s. DMs the platform
		// owner once if the server is unreachable for >= 5 minutes, and
		// once again when it recovers. No-op when CREATOR_DISCORD_ID is
		// unset (logs a warn so operators notice on first boot). Fully
		// decoupled from the request path — outageWatcher only reads
		// state, never participates in the actual server calls.
		registerOutageWatcher(client);

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

		// ── startup sweep of next-decree boards ──
		// What: posts every upcoming decree in the next 24h horizon to each
		//       guild's nextDecreeChannelId. Pairs with refreshAllSchedules:
		//       schedules are edited in place, next-decree posts are NEW.
		// When: once per boot. The dedup Set inside NextUpBoard guarantees
		//       a re-boot within 24h does not duplicate posts already made
		//       by a prior process — except across a restart, where some
		//       overlap is the accepted trade-off (channel is append-only).
		// Where: failures per-guild are logged and swallowed inside
		//        refreshAllNextUp; one bad guild does not stall the others.
		await refreshAllNextUp(client);

		// ── feature announcement sweep ─────────────────────────────
		// What: once-per-version broadcast to every setup-complete guild.
		//       Public post lands in #announcements, admin post in
		//       #inner-sanctum. Idempotent via botLogStore — most boots
		//       are no-ops, only the first boot after a deploy posts.
		// Who:  postFeatureAnnouncements in features/announcements/.
		//       Reads package.json version synchronously at module load.
		// When: runs LAST in the boot sequence so ensureHomebase +
		//       refreshIntroEmbeds + refreshAllSchedules have finished
		//       and channel ids in GuildConfig are freshest.
		// Where: fire-and-forget? NO — we await it, but internally each
		//        guild is isolated so one failure cannot stall others.
		//        Errors are logged and swallowed inside the helper.
		await postFeatureAnnouncements(client);

		console.log(LOG_MESSAGES.main.readyBanner(client.user?.tag ?? "unknown"));
	});

	// login the bot after everything is set up
	await client.login(discordToken);
})();
