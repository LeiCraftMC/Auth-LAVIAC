import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { API } from "../server/lib/api";
import { AppConstants } from "../server/lib/utils/constants";
import { makeAPIRequest } from "./helpers/api";
import { STATIC_AUTH_TEST_PASSWORD } from "./helpers/preload";

/** Static-auth credentials come from tests/helpers/preload.ts (`LAVIAC_STATIC_AUTH_*`). */
const TOKEN_PREFIX = `${AppConstants.APP_KEYS_PREFIX}_sess_`;

describe("static auth", () => {
	it("GET /auth/methods reports oidc=false and static=true", async () => {
		const res = await makeAPIRequest<{ oidc: boolean; static: boolean }>(
			API.getApp(),
			"/v1/auth/methods",
			{
				method: "GET",
				expectedBodySchema: z.object({ oidc: z.boolean(), static: z.boolean() }),
			},
		);
		expect(res.status).toBe(200);
		expect(res.data.oidc).toBe(false); // no OIDC env vars in the test harness
		expect(res.data.static).toBe(true);
	});

	it("rejects a wrong password", async () => {
		const res = await makeAPIRequest(
			API.getApp(),
			"/v1/auth/login",
			{
				method: "POST",
				body: { username: "admin", password: "definitely-wrong" },
			},
			401,
		);
		expect(res.body.success).toBe(false);
		expect(res.body.code).toBe(401);
	});

	it("rejects a wrong username", async () => {
		const res = await makeAPIRequest(
			API.getApp(),
			"/v1/auth/login",
			{
				method: "POST",
				body: { username: "not-admin", password: STATIC_AUTH_TEST_PASSWORD },
			},
			401,
		);
		expect(res.body.success).toBe(false);
	});

	it("logs in with the configured static credentials and returns a `<prefix>_sess_<id>:<base>` token", async () => {
		const res = await makeAPIRequest<{ token: string; expires_at: number }>(
			API.getApp(),
			"/v1/auth/login",
			{
				method: "POST",
				body: { username: "admin", password: STATIC_AUTH_TEST_PASSWORD },
				expectedBodySchema: z.object({ token: z.string(), expires_at: z.number() }),
			},
		);
		expect(res.status).toBe(200);
		expect(res.data.token.startsWith(TOKEN_PREFIX)).toBe(true);

		const rest = res.data.token.slice(TOKEN_PREFIX.length);
		const [id, base] = rest.split(":");
		expect(id).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
		expect(base).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
	});

	it("round-trips the session: login → /auth/me → logout → /auth/me 401", async () => {
		const login = await makeAPIRequest<{ token: string }>(API.getApp(), "/v1/auth/login", {
			method: "POST",
			body: { username: "admin", password: STATIC_AUTH_TEST_PASSWORD },
		});
		expect(login.status).toBe(200);

		const me = await makeAPIRequest<{ sub: string; role: string; login_method: string }>(
			API.getApp(),
			"/v1/auth/me",
			{
				method: "GET",
				authToken: login.data.token,
				expectedBodySchema: z.object({
					sub: z.string(),
					email: z.string().nullable(),
					name: z.string().nullable(),
					role: z.string(),
					login_method: z.string(),
				}),
			},
		);
		expect(me.status).toBe(200);
		expect(me.data.sub).toBe("admin");
		expect(me.data.role).toBe("admin");
		expect(me.data.login_method).toBe("static");

		const logout = await makeAPIRequest(API.getApp(), "/v1/auth/logout", {
			method: "POST",
			authToken: login.data.token,
		});
		expect(logout.status).toBe(200);

		await makeAPIRequest(
			API.getApp(),
			"/v1/auth/me",
			{
				method: "GET",
				authToken: login.data.token,
			},
			401,
		);
	});

	it("gates unauthenticated requests with 401 outside the public auth paths", async () => {
		await makeAPIRequest(API.getApp(), "/v1/auth/me", { method: "GET" }, 401);
		await makeAPIRequest(API.getApp(), "/v1/instances", { method: "GET" }, 401);
	});

	it("rejects malformed bearer tokens", async () => {
		await makeAPIRequest(
			API.getApp(),
			"/v1/auth/me",
			{
				method: "GET",
				authToken: "not-a-valid-token",
			},
			401,
		);
	});

	it("rate-limits repeated failures per username (429 + Retry-After)", async () => {
		// A distinct username so earlier tests' attempts are not counted.
		const maxAttempts = 5; // LOGIN_MAX_ATTEMPTS in routes/auth/index.ts
		for (let i = 0; i < maxAttempts; i++) {
			await makeAPIRequest(
				API.getApp(),
				"/v1/auth/login",
				{
					method: "POST",
					body: { username: "rate-limit-user", password: "wrong" },
				},
				401,
			);
		}

		const res = await makeAPIRequest(
			API.getApp(),
			"/v1/auth/login",
			{
				method: "POST",
				body: { username: "rate-limit-user", password: "wrong" },
			},
			429,
		);
		expect(res.body.code).toBe(429);
	});
});
