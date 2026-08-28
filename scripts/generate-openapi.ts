/**
 * generate-openapi — write the backend's OpenAPI spec to app/api-client/openapi.json
 * by driving the Hono `API` app in-process (no Nitro / dev server required).
 *
 * Used by `bun run api-client:generate` so client generation does not depend on a
 * running dev server (which is useful when `nuxt dev` is unavailable).
 */
import { writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { API } from "../server/lib/api";
import { ConfigHandler } from "../server/utils/config";

await ConfigHandler.loadConfig();
await API.init(false); // docs enabled so the spec route is registered

const res = await API.getApp().request("/docs/v1/openapi");
if (!res.ok) {
	console.error(`Failed to generate OpenAPI spec: HTTP ${res.status}`);
	process.exit(1);
}

const spec = (await res.json()) as {
	paths: Record<string, Record<string, { operationId?: string }>>;
};

// hono-openapi v1 auto-generates path-derived operationIds and does not let us set them on
// `describeRoute`. Remap them to clean names here so the generated SDK has readable functions
// (api.listInstances(), api.getInstance(), …).
const OP_IDS: Record<string, string> = {
	"GET /": "getIndex",
	"GET /auth/login": "getAuthLogin",
	"GET /auth/callback": "getAuthCallback",
	"POST /auth/logout": "postAuthLogout",
	"GET /auth/me": "getAuthMe",
	"GET /instances": "listInstances",
	"POST /instances": "createInstance",
	"GET /instances/{id}": "getInstance",
	"PUT /instances/{id}": "updateInstance",
	"DELETE /instances/{id}": "deleteInstance",
	"GET /instances/{instanceId}/domains": "listInstanceDomains",
	"POST /instances/{instanceId}/domains": "addInstanceDomain",
	"POST /instances/{instanceId}/domains/_set_primary": "setPrimaryInstanceDomain",
	"DELETE /instances/{instanceId}/domains/{domain}": "removeInstanceDomain",
	"PUT /instances/{instanceId}/limits": "setInstanceLimits",
	"DELETE /instances/{instanceId}/limits": "resetInstanceLimits",
	"POST /domains/{domain}/_exists": "checkDomainExists",
};

for (const [path, methods] of Object.entries(spec.paths)) {
	for (const [method, op] of Object.entries(methods)) {
		const key = `${method.toUpperCase()} ${path}`;
		if (OP_IDS[key]) op.operationId = OP_IDS[key];
	}
}

await mkdir("app/api-client", { recursive: true });
writeFileSync("app/api-client/openapi.json", `${JSON.stringify(spec, null, 2)}\n`);
console.log("OpenAPI spec written to app/api-client/openapi.json");
