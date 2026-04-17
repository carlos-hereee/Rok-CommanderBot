import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// ── vitest config for the bot ─────────────────────────────────────────
// the bot is pure ESM with bundler moduleResolution. source files import
// with the .js suffix convention (e.g. "@features/events/event.types.js").
// vite-tsconfig-paths teaches vitest to resolve the @-prefixed aliases from
// tsconfig.json, and vite's default extension resolution strips .js → .ts
// automatically. this keeps test files looking identical to source files.
//
// tests are colocated next to the module they cover (e.g.
// occurrenceCalculator.test.ts next to occurrenceCalculator.ts). the testing
// strategy doc prescribes this layout.
export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: [
				"src/features/events/occurrenceCalculator.ts",
				"src/api/middleware/**",
				"src/api/routes/**",
				"src/features/reminders/**",
			],
		},
	},
});
