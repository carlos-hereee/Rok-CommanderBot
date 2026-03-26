import express from "express";
import cors from "cors";
import { apiKeyAuth } from "./middleware/auth.js";
import { eventsRouter } from "./routes/events.routes.js";
import { leaderboardRouter } from "./routes/leaderboard.routes.js";
import { playersRouter } from "./routes/players.routes.js";
import { remindersRouter } from "./routes/reminders.routes.js";
import { dashboardOrigin, port } from "@utils/config.js";

export function startApiServer(): void {
	const app = express();

	// parse JSON bodies
	app.use(express.json());

	// allow your portfolio website to call the API
	// replace with your actual portfolio domain in production
	app.use(cors({ origin: dashboardOrigin }));

	// all routes are protected by API key
	app.use(apiKeyAuth);

	// routes
	app.use("/api/events", eventsRouter);
	app.use("/api/leaderboard", leaderboardRouter);
	app.use("/api/players", playersRouter);
	app.use("/api/reminders", remindersRouter);

	// health check — useful for Railway/Render to know the server is alive
	app.get("/health", (_, res) => res.json({ status: "ok" }));

	app.listen(port, () => {
		console.log(`API server running on port ${port}`);
	});
}
