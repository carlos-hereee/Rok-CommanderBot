import express from "express";
import cors from "cors";
import { Client } from "discord.js";
import { apiKeyAuth } from "./middleware/auth.js";
import { createEventsRouter } from "./routes/events.routes.js";
import { leaderboardRouter } from "./routes/leaderboard.routes.js";
import { playersRouter } from "./routes/players.routes.js";
import { remindersRouter } from "./routes/reminders.routes.js";
import { dashboardOrigin, port } from "@utils/config.js";
import { LOG_MESSAGES } from "@base/constants/log-messages.js";

// the Discord client is a dependency because the events router has one route
// (POST /api/events/:eventId/test-reminder) that needs to post to a channel.
// the rest of the API is pure DB reads/writes and does not touch the client.
export function startApiServer(client: Client): void {
	const app = express();

	// parse JSON bodies
	app.use(express.json());

	// allow your portfolio website to call the API
	// replace with your actual portfolio domain in production
	app.use(cors({ origin: dashboardOrigin }));

	// health check — useful for Railway/Render to know the server is alive
	// can be called by anyone without an API key, so keep it simple and non-sensitive
	app.get("/health", (_, res) => res.json({ status: "ok" }));

	// all routes are protected by API key
	app.use(apiKeyAuth);

	// routes
	app.use("/api/events", createEventsRouter(client));
	app.use("/api/leaderboard", leaderboardRouter);
	app.use("/api/players", playersRouter);
	app.use("/api/reminders", remindersRouter);

	app.listen(port, () => {
		console.log(LOG_MESSAGES.api.serverRunning(port));
	});
}
