import { beforeAll, describe, expect, test } from "bun:test";
import { API } from "../server/lib/api";
import { AuthHandler, AuthUtils } from "../server/lib/api/utils/authHandler";
import { AdminAuditModel } from "../server/lib/api/versions/v1/routes/admin/audit/model";
import { AdminHostModel } from "../server/lib/api/versions/v1/routes/admin/host/model";
import { AdminSessionsModel } from "../server/lib/api/versions/v1/routes/admin/sessions/model";
import { AdminStatisticsModel } from "../server/lib/api/versions/v1/routes/admin/statistics/model";
import { AdminTasksModel } from "../server/lib/api/versions/v1/routes/admin/tasks/model";
import { AuthModel } from "../server/lib/api/versions/v1/routes/auth/model";
import { AppConstants } from "../server/lib/utils/constants";
import { makeAPIRequest } from "./helpers/api";
import { STATIC_AUTH_TEST_PASSWORD } from "./helpers/preload";
import { type SeededSession, seedSession } from "./helpers/seed";

let admin: SeededSession;
let member: SeededSession;

beforeAll(async () => {
	admin = await seedSession("admin", "test-admin");
	member = await seedSession("member", "test-member");
});

describe("Global API routes", async () => {
	test("GET /health returns API health payload", async () => {
		const res = await API.getApp().request("/health");
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.message).toBe(`${AppConstants.APP_NAME} API is running`);
	});

	test("GET / redirects to the latest docs while docs are enabled", async () => {
		const res = await API.getApp().request("/");
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/docs/v1");
	});
});

describe("Auth routes and access checks", async () => {
	test("GET /v1/auth/methods reports oidc=false and static=true", async () => {
		const data = await makeAPIRequest("/v1/auth/methods", {
			expectedBodySchema: AuthModel.Methods.Response,
		});

		expect(data.oidc).toBe(false); // no OIDC env vars in the test env
		expect(data.static).toBe(true);
	});

	test("POST /v1/auth/login rejects a wrong password or username", async () => {
		await makeAPIRequest(
			"/v1/auth/login",
			{ method: "POST", body: { username: "admin", password: "definitely-wrong" } },
			401,
		);
		await makeAPIRequest(
			"/v1/auth/login",
			{ method: "POST", body: { username: "not-admin", password: STATIC_AUTH_TEST_PASSWORD } },
			401,
		);
	});

	test("POST /v1/auth/login creates a session for the static admin", async () => {
		const data = await makeAPIRequest("/v1/auth/login", {
			method: "POST",
			body: { username: "admin", password: STATIC_AUTH_TEST_PASSWORD },
			expectedBodySchema: AuthModel.Login.Response,
		});

		expect(data.token.startsWith(`${AppConstants.APP_KEYS_PREFIX}_sess_`)).toBe(true);

		const tokenParts = AuthUtils.getTokenParts(data.token);
		expect(tokenParts?.id).toMatch(/^[0-9a-f]{64}$/);
		expect(tokenParts?.base).toMatch(/^[0-9a-f]{64}$/);

		const session = await AuthHandler.getAuthContext(data.token);
		expect(session?.user_sub).toBe("admin");
		expect(session?.user_role).toBe("admin");
		expect(session?.login_method).toBe("static");
	});

	test("login → /auth/session → logout → /auth/session 401", async () => {
		const login = await makeAPIRequest("/v1/auth/login", {
			method: "POST",
			body: { username: "admin", password: STATIC_AUTH_TEST_PASSWORD },
			expectedBodySchema: AuthModel.Login.Response,
		});

		const session = await makeAPIRequest("/v1/auth/session", {
			authToken: login.token,
			expectedBodySchema: AuthModel.Session.Response,
		});
		expect(session.user_sub).toBe("admin");
		expect(session.user_role).toBe("admin");
		expect(session.login_method).toBe("static");
		expect(session.expires_at).toBeGreaterThan(Date.now());
		expect("hashed_token" in session).toBe(false);

		await makeAPIRequest("/v1/auth/logout", { method: "POST", authToken: login.token });
		await makeAPIRequest("/v1/auth/session", { authToken: login.token }, 401);
	});

	test("unauthenticated and malformed requests get 401 outside the public auth paths", async () => {
		await makeAPIRequest("/v1/auth/session", {}, 401);
		await makeAPIRequest("/v1/instances", {}, 401);
		await makeAPIRequest("/v1/admin/statistics", {}, 401);
		await makeAPIRequest("/v1/auth/session", { authToken: "not-a-valid-token" }, 401);
	});

	test("non-admin sessions get 403 on instances and admin routes", async () => {
		await makeAPIRequest("/v1/instances", { authToken: member.token }, 403);
		await makeAPIRequest("/v1/domains/example.com/_exists", { authToken: member.token }, 403);
		await makeAPIRequest("/v1/admin/host", { authToken: member.token }, 403);
	});

	test("POST /v1/auth/login rate-limits repeated failures (429 + Retry-After)", async () => {
		const maxAttempts = 5; // LOGIN_MAX_ATTEMPTS in routes/auth/index.ts
		for (let i = 0; i < maxAttempts; i++) {
			await makeAPIRequest(
				"/v1/auth/login",
				{ method: "POST", body: { username: "rate-limit-user", password: "wrong" } },
				401,
			);
		}

		await makeAPIRequest(
			"/v1/auth/login",
			{ method: "POST", body: { username: "rate-limit-user", password: "wrong" } },
			429,
		);
	});
});

describe("Admin routes", async () => {
	test("GET /v1/admin/statistics serves local statistics even without Zitadel", async () => {
		const data = await makeAPIRequest("/v1/admin/statistics", {
			authToken: admin.token,
			expectedBodySchema: AdminStatisticsModel.Get.Response,
		});

		// No System API in the test env.
		expect(data.instances).toBeNull();
		expect(data.zitadelError).not.toBeNull();

		expect(data.audit.perDay).toHaveLength(30);
		expect(data.audit.total).toBeGreaterThan(0); // the static logins above
		expect(data.audit.topActions.some((a) => a.action === "auth.login")).toBe(true);
		expect(data.sessions.active).toBeGreaterThanOrEqual(2);
	});

	test("GET /v1/admin/host returns the host snapshot", async () => {
		const data = await makeAPIRequest("/v1/admin/host", {
			authToken: admin.token,
			expectedBodySchema: AdminHostModel.Get.Response,
		});

		expect(data.cpu.cores).toBeGreaterThan(0);
		expect(data.memory.total).toBeGreaterThan(0);
		expect(data.runtime.bunVersion).toBe(Bun.version);
		expect(data.zitadel.reachable).toBe(false);
	});

	test("GET /v1/admin/host/metrics validates the range", async () => {
		const data = await makeAPIRequest("/v1/admin/host/metrics?range=1h", {
			authToken: admin.token,
			expectedBodySchema: AdminHostModel.Metrics.Response,
		});
		expect(data.range).toBe("1h");

		await makeAPIRequest("/v1/admin/host/metrics?range=1y", { authToken: admin.token }, 400);
	});

	test("GET /v1/admin/audit lists and filters entries", async () => {
		const all = await makeAPIRequest("/v1/admin/audit", {
			authToken: admin.token,
			expectedBodySchema: AdminAuditModel.GetAll.Response,
		});
		expect(all.total).toBe(all.items.length);
		expect(all.items[0]?.id).toBeGreaterThan(all.items[all.items.length - 1]?.id ?? 0);

		const logouts = await makeAPIRequest("/v1/admin/audit?action=auth.logout", {
			authToken: admin.token,
			expectedBodySchema: AdminAuditModel.GetAll.Response,
		});
		expect(logouts.items.length).toBeGreaterThan(0);
		expect(logouts.items.every((entry) => entry.action === "auth.logout")).toBe(true);
	});

	test("GET /v1/admin/sessions lists sessions and marks the current one", async () => {
		const sessions = await makeAPIRequest("/v1/admin/sessions", {
			authToken: admin.token,
			expectedBodySchema: AdminSessionsModel.GetAll.Response,
		});

		const own = sessions.find((s) => s.current);
		expect(own?.user_sub).toBe("test-admin");
		expect(sessions.some((s) => "hashed_token" in s)).toBe(false);
	});

	test("DELETE /v1/admin/sessions/:sessionId revokes other sessions only", async () => {
		const other = await seedSession("admin");
		const otherId = AuthUtils.getTokenParts(other.token)?.id ?? "";
		const ownId = AuthUtils.getTokenParts(admin.token)?.id ?? "";

		await makeAPIRequest(
			`/v1/admin/sessions/${ownId}`,
			{ method: "DELETE", authToken: admin.token },
			400,
		);
		await makeAPIRequest(`/v1/admin/sessions/${otherId}`, {
			method: "DELETE",
			authToken: admin.token,
		});
		await makeAPIRequest("/v1/auth/session", { authToken: other.token }, 401);
		await makeAPIRequest(
			`/v1/admin/sessions/${otherId}`,
			{ method: "DELETE", authToken: admin.token },
			404,
		);
	});

	test("GET /v1/admin/tasks lists tasks; unknown ids are 404", async () => {
		const tasks = await makeAPIRequest("/v1/admin/tasks", {
			authToken: admin.token,
			expectedBodySchema: AdminTasksModel.GetAll.Response,
		});
		expect(Array.isArray(tasks)).toBe(true);

		await makeAPIRequest("/v1/admin/tasks/999999", { authToken: admin.token }, 404);
	});
});
