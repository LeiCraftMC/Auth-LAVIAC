import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
	input: "./data/temp-api-openapi.json",
	output: "app/api-client",
	plugins: [
		// LAVIAC divergence — client-nuxt produces type errors under Windows/Bun/vue-tsc
		// (see AGENTS.md); use client-fetch instead.
		"@hey-api/client-fetch",
		"@hey-api/typescript",
		"@hey-api/sdk",
		"zod",
	],
});
