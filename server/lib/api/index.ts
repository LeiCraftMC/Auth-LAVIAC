/**
 * API — the Hono app, mounted inside Nitro (full-stack Nuxt shape).
 *
 * No Bun.serve / Main.main() / shutdown handlers — Nitro owns the lifecycle. init() is
 * called from server/plugins/startup.ts; the catch-all server/routes/api/[...].ts
 * forwards each request to getApp().fetch(). See Style-Guides docs/04 (Mounting Hono in
 * Nitro) and docs/01 (Full-stack Nuxt app).
 */

import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { prettyJSON } from "hono/pretty-json";
import { openAPIRouteHandler } from "hono-openapi";
import { Logger } from "../../utils/logger";
import type { APIVersionRouter } from "./utils/api-version-router";
import { AuthHandler } from "./utils/auth-handler";
import { APIv1Router } from "./versions/v1";

export class API {
	protected static app: Hono | undefined;
	protected static latestVersion: number | null = null;

	protected static registerVersion(versionRouter: APIVersionRouter, disableDocs = false) {
		if (!API.app) throw new Error("API not initialized. Call API.init() first.");
		API.app.route(`/v${versionRouter.version}`, versionRouter.router);
		if (!API.latestVersion || versionRouter.version > API.latestVersion) {
			API.latestVersion = versionRouter.version;
		}
		if (!disableDocs) {
			API.app.get(
				`/docs/v${versionRouter.version}/openapi`,
				openAPIRouteHandler(versionRouter.router, versionRouter.openAPIConfig),
			);
			API.app.get(
				`/docs/v${versionRouter.version}`,
				Scalar({ url: `/docs/v${versionRouter.version}/openapi` }),
			);
		}
	}

	static async init(disableDocs = false) {
		API.app = new Hono();

		API.app.use(prettyJSON());

		// Resolve the session on every request so handlers can read it via AuthHandler.getAuthContext.
		API.app.use("*", async (c, next) => {
			AuthHandler.setAuthContext(c, await AuthHandler.resolveRequest(c));
			await next();
		});

		API.app.onError((err, c) => {
			if (err instanceof HTTPException) {
				return c.json({ success: false, code: err.status, message: err.message }, err.status);
			}
			Logger.error("API Error:", err);
			return c.json({ success: false, code: 500, message: "Internal Server Error" }, 500);
		});

		API.registerVersion(new APIv1Router(), disableDocs);

		API.app.get("/health", (c) =>
			c.json({ success: true, code: 200, message: "healthy", data: null }),
		);
	}

	static getApp(): Hono {
		if (!API.app) throw new Error("API not initialized. Call API.init() first.");
		return API.app;
	}
}
