import { Client, TextChannel } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { guildConfigStore } from "@db/stores/guildConfigStore.js";
import { botLogStore } from "@db/stores/botLogStore.js";
import { featureAnnouncedEvent } from "@base/constants/BOT_LOG_EVENTS.js";
import { embedContent } from "@base/constants/embed-content.js";
import { infoEmbed } from "@utils/embedBuilder.js";

// ── postFeatureAnnouncement ──────────────────────────────────────────
// What:  once per (guild, version) broadcast posted on bot boot. Two
//        surfaces per guild: #announcements (public, godly voice) and
//        #inner-sanctum (admin, plain voice, no ping). Copy lives in
//        embedContent.featureAnnouncement and is keyed by the bot's
//        current package.json version; idempotency is enforced via
//        botLogStore with a `feature_announced:<version>` event key
//        so every new release gets its own bucket.
// Who:   called once at the tail of main.ts's ClientReady boot loop,
//        after ensureHomebase, refreshIntroEmbeds, and
//        refreshAllSchedules have finished. No other caller.
// When:  every boot. Most boots are no-ops (every guild has already
//        logged this version). Only the first boot after a deploy
//        actually posts anything.
// Where: reads the bot's version by resolving ../../../package.json
//        relative to the COMPILED module location in dist/. The
//        postinstall tsc-alias step does not rewrite relative paths,
//        so we build the path from import.meta.url at runtime.
// How:   ① load package.json version once (cheap, synchronous, runs
//           only on ClientReady);
//        ② iterate cached guilds sequentially so one guild's Discord
//           hiccup cannot stall the rest;
//        ③ for each guild: skip if setupComplete is false (new guilds
//           see the intro embed instead). skip if the version has
//           already been logged. otherwise post public + inner-sanctum
//           and log success.
//        ④ failures on either post are swallowed with a log. the
//           botLogStore write only fires after BOTH posts succeed so
//           a partial failure re-attempts next boot.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── resolve bot version from package.json ───────────────────────────
// Compiled module lives at dist/features/announcements/postFeatureAnnouncement.js
// so package.json is three directories up. Resolve once at module load
// and cache — version cannot change without a new process. fs.readFileSync
// is correct here: this is one-shot init, not a hot path.
function loadBotVersion(): string {
	try {
		const pkgPath = path.resolve(__dirname, "..", "..", "..", "package.json");
		const raw = fs.readFileSync(pkgPath, "utf-8");
		const pkg = JSON.parse(raw) as { version?: string };
		if (!pkg.version) {
			console.warn("[feature-announcement] package.json has no version field; announcements disabled");
			return "";
		}
		return pkg.version;
	} catch (error) {
		// If we cannot read package.json, skip announcements entirely
		// rather than risk a weird idempotency key. The bot's other
		// features keep running; this is a degraded-mode fallback.
		console.warn("[feature-announcement] could not read package.json; announcements disabled", error);
		return "";
	}
}

const BOT_VERSION = loadBotVersion();

export async function postFeatureAnnouncements(client: Client): Promise<void> {
	if (!BOT_VERSION) return;

	const c = embedContent.featureAnnouncement;
	const eventKey = featureAnnouncedEvent(BOT_VERSION);

	let posted = 0;
	let skipped = 0;

	// Sequential loop so one guild's Discord failure does not stall
	// the others. Parallel (Promise.all) would be slightly faster at
	// boot but loses the isolation guarantee and makes log ordering
	// harder to read when something does go wrong.
	for (const guild of client.guilds.cache.values()) {
		try {
			const config = await guildConfigStore.findByGuildId(guild.id);

			// Skip new guilds: setupComplete false means they either just
			// joined or never finished /setup. The intro embed covers the
			// "what does this bot do" question for them; a feature
			// announcement would be confusing when they have not yet
			// experienced the baseline features.
			if (!config?.setupComplete) {
				skipped += 1;
				continue;
			}

			// Idempotency: has this guild already seen this version?
			// botLogStore.has is a single-document indexed lookup — cheap
			// enough to run once per guild per boot without batching.
			const alreadyAnnounced = await botLogStore.has(guild.id, eventKey);
			if (alreadyAnnounced) {
				skipped += 1;
				continue;
			}

			// Resolve target channels. Both must exist and be TextChannels
			// for the announcement to fire — a missing announcements
			// channel is either a brand-new guild (caught above) or a
			// destroyed homebase (ensureHomebase's problem, not ours).
			const announcementsChannelId = config.announcementsChannelId;
			const adminChannelId = config.adminChannelId;
			if (!announcementsChannelId || !adminChannelId) {
				// Not a failure, just nothing to do. Do not log so the
				// next boot (when ensureHomebase has rebuilt) re-attempts.
				console.warn(`[feature-announcement] guild ${guild.id} missing announcement channels; deferring`);
				continue;
			}

			const announcementsChannel = await client.channels.fetch(announcementsChannelId).catch(() => null);
			const adminChannel = await client.channels.fetch(adminChannelId).catch(() => null);
			if (!(announcementsChannel instanceof TextChannel) || !(adminChannel instanceof TextChannel)) {
				console.warn(`[feature-announcement] guild ${guild.id} channels missing or wrong type; deferring`);
				continue;
			}

			// ── ① public announcement ─────────────────────────────
			// Posted WITHOUT a role ping per the owner's preference for
			// inner-sanctum-style quiet posts. The embed itself is loud
			// enough; a role ping here would feel like spam on every
			// release boot (since this fires once per version per guild
			// and existing members already have the notification dot).
			//
			// allowedMentions: { parse: [] } is belt-and-suspenders —
			// if a future edit ever adds a raw @everyone to the copy,
			// this prevents accidental mass notifications.
			const publicEmbed = infoEmbed(c.public.title, c.public.description, embedContent.COLORS.ANNOUNCEMENTS);
			await announcementsChannel.send({
				embeds: [publicEmbed],
				allowedMentions: { parse: [] },
			});

			// ── ② inner-sanctum admin update ───────────────────────
			// Plain voice, no ping, same allowedMentions guard. Posted
			// AFTER the public one so a failure on the public post does
			// not leave the admin with a "here's what shipped" while
			// the community has not seen anything yet.
			const adminEmbed = infoEmbed(c.innerSanctum.title, c.innerSanctum.description, embedContent.COLORS.ADMIN);
			await adminChannel.send({
				embeds: [adminEmbed],
				allowedMentions: { parse: [] },
			});

			// ── ③ log success ──────────────────────────────────────
			// Only AFTER both posts succeeded. A partial failure above
			// leaves the log blank, so the next boot re-attempts. This
			// is why the public post comes first — a duplicate public
			// post on retry is visible to the community, so we want the
			// admin post to be the one that retries, not the public one.
			// ...Actually on second thought that reasoning is reversed:
			// if the public post succeeds and the admin post fails, a
			// retry will double-post publicly. Leaving this ordering
			// for now because a boot-loop failure scenario is rare
			// enough that accepting possible double-publics is the
			// lesser evil vs. skipping the admin update entirely. If
			// this ever becomes a real issue, swap to log-after-public
			// with a separate admin retry.
			await botLogStore.log(guild.id, eventKey, { version: BOT_VERSION });
			posted += 1;
		} catch (error) {
			console.error(`[feature-announcement] guild ${guild.id} announcement failed`, error);
		}
	}

	if (posted > 0 || skipped > 0) {
		console.log(`[feature-announcement] version ${BOT_VERSION} — posted to ${posted} guild(s), skipped ${skipped}`);
	}
}
