import { defineConfig } from "@hey-api/openapi-ts";

// The spec is generated to a local file by `bun scripts/generate-openapi.ts` (driving the
// Hono API in-process), so client generation does not depend on a running dev server.
// During development the same spec is also served live at /api/docs/v1/openapi.
export default defineConfig({
	input: "app/api-client/openapi.json",
	output: "app/api-client",
	plugins: ["@hey-api/client-fetch"],
});
