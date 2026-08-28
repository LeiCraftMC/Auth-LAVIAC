import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./server/db/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
	dbCredentials: {
		url: process.env.LAVIAC_DB_PATH || "./data/laviac.sqlite",
	},
});
