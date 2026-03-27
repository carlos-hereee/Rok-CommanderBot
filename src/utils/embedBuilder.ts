import { EmbedBuilder, ColorResolvable } from "discord.js";
import { IGameEvent, IPrepStep } from "@features/events/event.types.js";

// ── base builder — shared config for all embeds ───────────────
// ensures consistent styling across the whole bot
function base(): EmbedBuilder {
	return new EmbedBuilder().setTimestamp().setFooter({ text: "ROK Commander Bot" });
}

// ── reminder embed ────────────────────────────────────────────
export function reminderEmbed(event: IGameEvent, occurrence: Date, offsetMinutes: number): EmbedBuilder {
	return base()
		.setTitle(`⚔️ ${event.name} starts in ${offsetMinutes} minutes!`)
		.setDescription("Prepare now so you're ready when the event begins.")
		.setColor("Red")
		.addFields(
			{
				name: "📋 Preparation Checklist",
				value: (event.prepSteps as IPrepStep[])
					.sort((a, b) => a.order - b.order)
					.map((step, i) => `${i + 1}. ${step.label}`)
					.join("\n"),
			},
			{
				name: "🕐 Event Time",
				value: `<t:${Math.floor(occurrence.getTime() / 1000)}:F>`,
			}
		);
}

// ── season end embed ──────────────────────────────────────────
export function seasonEndEmbed(): EmbedBuilder {
	return base()
		.setTitle("🏁 KvK Season Has Ended")
		.setDescription(
			"The KvK season has concluded. Reminders have been stopped.\n\n" +
				"Run `/configure-rok-reminders` when the next season begins."
		)
		.setColor("DarkGrey");
}

// ── leaderboard embed ─────────────────────────────────────────
export function leaderboardEmbed(
	eventName: string,
	ranked: {
		username: string;
		totalScore: number;
		eventsAttended: number;
		totalAcknowledged: number;
	}[]
): EmbedBuilder {
	const medals = ["🥇", "🥈", "🥉"];

	return base()
		.setTitle(`🏆 ${eventName} — Leaderboard`)
		.setColor("Gold")
		.setDescription(
			ranked
				.map((p, i) => {
					const medal = medals[i] ?? `**${i + 1}.**`;
					return [
						`${medal} **${p.username}**`,
						`Score: ${p.totalScore} | Events: ${p.eventsAttended} | Reminders acknowledged: ${p.totalAcknowledged}`,
					].join("\n");
				})
				.join("\n\n")
		)
		.setFooter({
			text: "Full leaderboard and controls available on the admin dashboard",
		});
}

// ── confirmation embed ────────────────────────────────────────
export function kvkConfirmationEmbed(dates: {
	seasonEnd: Date;
	ruinsFirst: Date;
	altarFirst: Date;
	kauEasy: Date;
	kauNormal: Date;
	kauHard: Date;
	kauNightmare: Date;
	channelId: string;
}): EmbedBuilder {
	const t = (date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:F>`;

	return base()
		.setTitle("⚔️ KvK Reminder Configuration — Please Confirm")
		.setDescription(
			"Verify these dates match what you see in-game before confirming.\n" +
				"Discord timestamps shown in **your local timezone**."
		)
		.setColor("Yellow")
		.addFields(
			{
				name: "📅 Season End",
				value: `<t:${Math.floor(dates.seasonEnd.getTime() / 1000)}:D>`,
				inline: false,
			},
			{
				name: "🏚️ Ancient Ruins",
				value: [`First occurrence: ${t(dates.ruinsFirst)}`, `Repeats every **36 hours** until season end`].join("\n"),
				inline: false,
			},
			{
				name: "🕯️ Altar of Darkness",
				value: [`First occurrence: ${t(dates.altarFirst)}`, `Repeats every **84 hours** until season end`].join("\n"),
				inline: false,
			},
			{
				name: "⚔️ Trial of Kau Karuak",
				value: [
					`Easy:      ${t(dates.kauEasy)}`,
					`Normal:    ${t(dates.kauNormal)}  *(+14 days)*`,
					`Hard:      ${t(dates.kauHard)}  *(+17 days)*`,
					`Nightmare: ${t(dates.kauNightmare)}  *(+6 days)*`,
				].join("\n"),
				inline: false,
			},
			{
				name: "📢 Reminder Channel",
				value: `<#${dates.channelId}>`,
				inline: false,
			}
		);
}

// ── generic error embed ───────────────────────────────────────
// use this anywhere you need to send a consistent error message
export function errorEmbed(message: string): EmbedBuilder {
	return base().setTitle("❌ Error").setDescription(message).setColor("DarkRed");
}

// ── generic info embed ────────────────────────────────────────
export function infoEmbed(title: string, description: string, color: ColorResolvable = "Blurple"): EmbedBuilder {
	return base().setTitle(title).setDescription(description).setColor(color);
}
