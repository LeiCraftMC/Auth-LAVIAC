import { defineConfig } from "drizzle-kit";

export default defineConfig({
	out: "./drizzle",
	schema: "./server/db/schema.ts",
	dialect: "sqlite",
	dbCredentials: {
		url: process.env.LAVIAC_DB_PATH ?? "./data/db.sqlite",
	},
	verbose: true,
	strict: true,
});
