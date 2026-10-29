import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createHmac } from "node:crypto";
import { API } from "../server/lib/api";
import { SyncClaimsTask } from "../server/lib/tasks/syncClaims";
import { ConfigHandler, type ParsedConfig } from "../server/lib/utils/config";
import { ZitadelClaims } from "../server/lib/zitadel/claims";
import { ZitadelClient } from "../server/lib/zitadel/client";
import type { ZitadelExecution, ZitadelTarget } from "../server/lib/zitadel/types";

const KEY = "test-signing-key";

const now = () => Math.floor(Date.now() / 1000);

function sign(body: string, key = KEY, t = now()) {
	return `t=${t},v1=${createHmac("sha256", key).update(`${t}.${body}`).digest("hex")}`;
}

/** Zitadel's roles claim value: role key → { org id: org domain }. */
function roleMap(...roles: string[]) {
	return Object.fromEntries(roles.map((role) => [role, { "2": "acme.example.com" }]));
}

/**
 * A `preuserinfo` payload as Zitadel sends it (trimmed). `profile` decides preferred_username;
 * `userinfo` adds claims such as the roles.
 */
function payload(
	opts: { profile?: boolean; username?: string; userinfo?: Record<string, unknown> } = {},
) {
	const { profile = true, username = "alice", userinfo = {} } = opts;
	return JSON.stringify({
		function: "function/preuserinfo",
		userinfo: {
			sub: "1",
			...(profile ? { preferred_username: `${username}@acme.example.com` } : {}),
			...userinfo,
		},
		user: { id: "1", username, preferred_login_name: "alice@acme.example.com" },
		org: { id: "2", name: "Acme", primary_domain: "acme.example.com" },
		application: { client_id: "client-1" },
		user_metadata: [],
		user_grants: [],
	});
}

const answer = (body: string) => ZitadelClaims.answer(JSON.parse(body));

// The claim names apps are configured with; spelled out so a rename shows up here.
const USERNAME = "urn:lcmc-auth:username";
const ROLES = "urn:lcmc-auth:roles";
const PROJECT_ROLES = "urn:lcmc-auth:project-roles";

describe("Claims answer", () => {
	test("username: the plain username with the profile scope, nothing without", () => {
		expect(answer(payload())).toEqual({ append_claims: [{ key: USERNAME, value: "alice" }] });
		expect(answer(payload({ profile: false }))).toEqual({});
	});

	test("username: strips the org domain from a username created with it", () => {
		const claims = answer(payload({ username: "Alice@ACME.example.com" })).append_claims;
		expect(claims?.[0]?.value).toBe("Alice");
	});

	test("roles: the app's own project only; project-roles: every project, with its id", () => {
		const body = payload({
			profile: false,
			userinfo: {
				// Zitadel sends the app's own project (111) twice: without and with its id.
				"urn:zitadel:iam:org:project:roles": roleMap("termix", "admin"),
				"urn:zitadel:iam:org:project:111:roles": roleMap("termix", "admin"),
				// Requested by scope; its `admin` is another role than 111's.
				"urn:zitadel:iam:org:project:222:roles": roleMap("admin", "grafana-viewer"),
				// Not a roles claim.
				"urn:zitadel:iam:user:resourceowner:name": "Acme",
			},
		});
		expect(answer(body)).toEqual({
			append_claims: [
				{ key: ROLES, value: ["admin", "termix"] },
				{ key: PROJECT_ROLES, value: ["111:admin", "111:termix", "222:admin", "222:grafana-viewer"] },
			],
		});
	});

	test("project-roles: a role key can't pass for another project's role", () => {
		const own = roleMap("222:admin");
		const body = payload({
			profile: false,
			userinfo: {
				"urn:zitadel:iam:org:project:roles": own,
				"urn:zitadel:iam:org:project:111:roles": own,
			},
		});
		expect(answer(body)).toEqual({
			append_claims: [
				{ key: ROLES, value: ["222:admin"] },
				{ key: PROJECT_ROLES, value: ["111:222:admin"] },
			],
		});
	});

	test("roles: none when only other projects' roles are sent", () => {
		const body = payload({
			profile: false,
			userinfo: { "urn:zitadel:iam:org:project:222:roles": roleMap("superadmin") },
		});
		expect(answer(body)).toEqual({
			append_claims: [{ key: PROJECT_ROLES, value: ["222:superadmin"] }],
		});
	});

	test("roles: nothing when Zitadel sends no roles", () => {
		expect(answer(payload({ profile: false, userinfo: {} }))).toEqual({});
	});

	test("username and roles together", () => {
		const body = payload({
			userinfo: {
				"urn:zitadel:iam:org:project:roles": roleMap("admin"),
				"urn:zitadel:iam:org:project:111:roles": roleMap("admin"),
			},
		});
		expect(answer(body)).toEqual({
			append_claims: [
				{ key: USERNAME, value: "alice" },
				{ key: ROLES, value: ["admin"] },
				{ key: PROJECT_ROLES, value: ["111:admin"] },
			],
		});
	});

	test("accepts only recent signatures made with the key", () => {
		const body = payload();
		expect(ZitadelClaims.verifySignature(sign(body), body, KEY)).toBe(true);
		// One of several v1 values (a regenerated key in its grace period) is enough.
		const both = `${sign(body, "old-key")},v1=${sign(body).split("v1=")[1]}`;
		expect(ZitadelClaims.verifySignature(both, body, KEY)).toBe(true);

		expect(ZitadelClaims.verifySignature(sign(body, "other-key"), body, KEY)).toBe(false);
		expect(ZitadelClaims.verifySignature(sign(body), `${body} `, KEY)).toBe(false);
		expect(ZitadelClaims.verifySignature(sign(body, KEY, now() - 600), body, KEY)).toBe(false);
		expect(ZitadelClaims.verifySignature(undefined, body, KEY)).toBe(false);
		expect(ZitadelClaims.verifySignature("t=abc,v1=zz", body, KEY)).toBe(false);
	});

	test("the endpoint is the configured webhook URL, else LAVIAC's own", () => {
		expect(ZitadelClaims.endpoint("123")).toBe("https://203.0.113.10/api/v1/hooks/claims/123");
		withConfig({ ZITADEL_CLAIMS_WEBHOOK_URL: undefined }, () => {
			expect(ZitadelClaims.endpoint("123")).toBe("http://localhost:12191/api/v1/hooks/claims/123");
		});
		withConfig({ ZITADEL_CLAIMS: false }, () => {
			expect(ZitadelClaims.endpoint("123")).toBeNull();
		});
	});
});

/** Run `fn` with config values changed, then restore them. */
function withConfig<T>(values: Partial<ParsedConfig>, fn: () => T): T {
	const config = ConfigHandler.getConfig() as ParsedConfig;
	const saved = { ...config };
	Object.assign(config, values);
	const restore = () => Object.assign(config, saved);
	try {
		const result = fn();
		if (result instanceof Promise) return result.finally(restore) as T;
		restore();
		return result;
	} catch (err) {
		restore();
		throw err;
	}
}

describe("Claims sync", () => {
	const spies: { mockRestore(): void }[] = [];
	afterEach(() => {
		for (const spy of spies.splice(0)) spy.mockRestore();
	});

	const HOST = "acme.example.com";
	const PHP = {
		id: "php",
		name: "clean-username-target",
		endpoint: "https://php.example.com/claim",
	};
	const OLD = {
		id: "old",
		name: "laviac-username-claim",
		endpoint: "https://laviac.example.com/old",
	};
	const OTHER = { id: "other", name: "someone-elses-target", endpoint: "https://other.example.com" };
	const fn = (name: string) => ({ function: { name } });

	/** Mock the instance's targets and executions; returns the ordered write log. */
	function mockInstance(
		targets: ZitadelTarget[],
		executions: ZitadelExecution[],
		selfTestProblem: string | null = null,
	) {
		const writes: { name: string; args: unknown[] }[] = [];
		const write = (name: string, result?: unknown) =>
			(async (...args: unknown[]) => {
				writes.push({ name, args: args.slice(1) });
				return result;
			}) as never;
		spies.push(
			spyOn(ZitadelClient, "listTargets").mockImplementation((async () => targets) as never),
			spyOn(ZitadelClient, "listExecutions").mockImplementation((async () => executions) as never),
			spyOn(ZitadelClient, "createTarget").mockImplementation(
				write("createTarget", { id: "new", signingKey: "new-key" }),
			),
			spyOn(ZitadelClient, "updateTarget").mockImplementation(write("updateTarget")),
			spyOn(ZitadelClient, "setExecution").mockImplementation(write("setExecution")),
			spyOn(ZitadelClient, "deleteTarget").mockImplementation(write("deleteTarget")),
			spyOn(ZitadelClaims, "selfTest").mockImplementation(async () => selfTestProblem),
		);
		return writes;
	}

	test("replaces the legacy targets everywhere once the webhook answers", async () => {
		const response = { response: { method: "/zitadel.oidc.v2.OIDCService/CreateCallback" } };
		const event = { event: { event: "user.human.added" } };
		const writes = mockInstance(
			[PHP, OLD, OTHER],
			[
				{ condition: fn("preuserinfo"), targets: ["php", "other"] },
				{ condition: response, targets: ["old"] },
				{ condition: event, targets: ["other"] },
			],
		);

		const result = await ZitadelClaims.sync("8000001", HOST);
		expect(result.problem).toBeNull();
		expect(writes).toEqual([
			{
				name: "createTarget",
				args: [
					{
						name: "laviac-claims",
						endpoint: "https://203.0.113.10/api/v1/hooks/claims/8000001",
						timeout: "5s",
						restCall: { interruptOnError: false },
					},
				],
			},
			// In the legacy target's place, the instance's own target kept.
			{ name: "setExecution", args: [fn("preuserinfo"), ["new", "other"]] },
			// An empty list removes the execution.
			{ name: "setExecution", args: [response, []] },
			{ name: "setExecution", args: [fn("preaccesstoken"), ["new"]] },
			{ name: "deleteTarget", args: ["php"] },
			{ name: "deleteTarget", args: ["old"] },
		]);
		expect(result.changes).toContain("deleted the legacy target clean-username-target");
	});

	test("keeps the legacy targets and leaves its own detached while the webhook doesn't answer", async () => {
		const writes = mockInstance(
			[PHP],
			[{ condition: fn("preuserinfo"), targets: ["php"] }],
			"the webhook is unreachable",
		);

		const result = await ZitadelClaims.sync("8000002", HOST);
		expect(result.problem).toBe("the webhook is unreachable");
		expect(writes.map((w) => w.name)).toEqual(["createTarget"]);
	});

	test("writes nothing for an endpoint Zitadel would refuse", async () => {
		for (const url of [
			"http://localhost:12191/api/v1/hooks/claims",
			"http://127.0.0.1:12191/api/v1/hooks/claims",
			"https://10.0.0.5/api/v1/hooks/claims",
			"https://[fd00::1]/api/v1/hooks/claims",
		]) {
			const writes = mockInstance([PHP], [{ condition: fn("preuserinfo"), targets: ["php"] }]);
			const result = await withConfig({ ZITADEL_CLAIMS_WEBHOOK_URL: url }, () =>
				ZitadelClaims.sync("8000003", HOST),
			);
			expect(result.problem).toContain("LAVIAC_ZITADEL_CLAIMS_WEBHOOK_URL");
			expect(writes).toEqual([]);
			for (const spy of spies.splice(0)) spy.mockRestore();
		}
	});

	test("with the claims off, removes its own target and keeps the legacy ones", async () => {
		const own = { id: "own", name: "laviac-claims", endpoint: "https://203.0.113.10/x" };
		const writes = mockInstance(
			[PHP, own],
			[
				{ condition: fn("preuserinfo"), targets: ["php", "own"] },
				{ condition: fn("preaccesstoken"), targets: ["own"] },
			],
		);

		const result = await withConfig({ ZITADEL_CLAIMS: false }, () =>
			ZitadelClaims.sync("8000004", HOST),
		);
		expect(result.problem).toBeNull();
		expect(writes).toEqual([
			{ name: "setExecution", args: [fn("preuserinfo"), ["php"]] },
			{ name: "setExecution", args: [fn("preaccesstoken"), []] },
			{ name: "deleteTarget", args: ["own"] },
		]);
	});

	test("the self-test reaches the webhook through its URL with the target's key", async () => {
		const instanceId = "8000005";
		const writes = mockInstance([], []);
		// The real self-test, against this API instead of the network. The sync tells the webhook
		// the instance and the key, so the webhook asks Zitadel for neither.
		for (const spy of spies.splice(-1)) spy.mockRestore();
		spies.push(
			spyOn(globalThis, "fetch").mockImplementation((async (input: string, init: RequestInit) =>
				API.getApp().request(new URL(input).pathname.replace(/^\/api/, ""), init)) as never),
		);

		const result = await ZitadelClaims.sync(instanceId, HOST);
		expect(result.problem).toBeNull();
		expect(writes.filter((w) => w.name === "setExecution")).toHaveLength(2);

		// A key the webhook doesn't know fails it.
		expect(
			await ZitadelClaims.selfTest(ZitadelClaims.endpoint(instanceId) as string, "wrong-key"),
		).toBe(`the webhook answered HTTP 401 at https://203.0.113.10/api/v1/hooks/claims/${instanceId}`);
	});
});

describe("syncClaims task", () => {
	const spies: { mockRestore(): void }[] = [];
	afterEach(() => {
		for (const spy of spies.splice(0)) spy.mockRestore();
	});

	const logger = { debug() {}, info() {}, warn() {}, error() {} };
	const notPaused = { getV: () => false, setV() {} } as never;
	const run = () =>
		SyncClaimsTask({}, logger, { data: {}, nextStepToExecute: 0 }, notPaused) as Promise<{
			success: boolean;
			message?: string;
		}>;

	test("syncs every running instance and fails when one is not in order", async () => {
		const synced: string[] = [];
		spies.push(
			spyOn(ZitadelClient, "listInstances").mockImplementation((async () => [
				{
					id: "1",
					name: "Prod",
					state: "STATE_RUNNING",
					domains: [{ domain: "a.example.com", primary: true }],
				},
				{ id: "2", name: "Down", state: "STATE_STOPPED", domains: [{ domain: "b.example.com" }] },
				{ id: "3", name: "Broken", state: "STATE_RUNNING", domains: [{ domain: "c.example.com" }] },
			]) as never),
			spyOn(ZitadelClaims, "sync").mockImplementation(async (id: string) => {
				synced.push(id);
				return { changes: [], problem: id === "3" ? "the webhook is unreachable" : null };
			}),
		);

		const result = await run();
		expect(synced).toEqual(["1", "3"]);
		expect(result).toMatchObject({ success: false });
		expect(result.message).toContain("Broken (3)");
		expect(result.message).not.toContain("Prod");
	});

	test("succeeds when every running instance is in order", async () => {
		spies.push(
			spyOn(ZitadelClient, "listInstances").mockImplementation((async () => [
				{
					id: "1",
					name: "Prod",
					state: "STATE_RUNNING",
					domains: [{ domain: "a.example.com", primary: true }],
				},
			]) as never),
			spyOn(ZitadelClaims, "sync").mockImplementation(async () => ({ changes: [], problem: null })),
		);

		expect(await run()).toMatchObject({ success: true });
	});
});

describe("Claims webhook", () => {
	const spies: { mockRestore(): void }[] = [];
	afterEach(() => {
		for (const spy of spies.splice(0)) spy.mockRestore();
	});

	// The instances of the mocked Zitadel; none of them provisioned by LAVIAC.
	const instanceIds = ["9000001", "9000002", "9000003"];

	/**
	 * Every instance's target signs with `key`; returns how often Zitadel was asked for a key
	 * (`count`) and for the instance list (`lists`).
	 */
	function mockTarget(key: string) {
		const calls = { count: 0, lists: 0 };
		spies.push(
			spyOn(ZitadelClient, "listInstances").mockImplementation((async () => {
				calls.lists++;
				return instanceIds.map((id) => ({ id, name: "Acme", state: "STATE_RUNNING" }));
			}) as never),
			spyOn(ZitadelClient, "getInstance").mockImplementation((async (id: string) => {
				calls.count++;
				return {
					id,
					name: "Acme",
					state: "STATE_RUNNING",
					domains: [{ domain: "acme.example.com", primary: true }],
				};
			}) as never),
			spyOn(ZitadelClient, "listTargets").mockImplementation((async () => [
				{
					id: "target-1",
					name: ZitadelClaims.TARGET_NAME,
					endpoint: "http://localhost",
					signingKey: key,
				},
			]) as never),
		);
		return calls;
	}

	function post(instanceId: string, body: string, signature?: string) {
		return API.getApp().request(`/v1/hooks/claims/${instanceId}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(signature ? { "ZITADEL-Signature": signature } : {}),
			},
			body,
		});
	}

	test("answers a signed call for an instance LAVIAC did not provision and caches the key", async () => {
		const calls = mockTarget(KEY);
		const [instanceId] = instanceIds as [string];

		const body = payload({
			userinfo: {
				"urn:zitadel:iam:org:project:roles": roleMap("devops"),
				"urn:zitadel:iam:org:project:111:roles": roleMap("devops"),
			},
		});
		const res = await post(instanceId, body, sign(body));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			append_claims: [
				{ key: USERNAME, value: "alice" },
				{ key: ROLES, value: ["devops"] },
				{ key: PROJECT_ROLES, value: ["111:devops"] },
			],
		});

		const bare = payload({ profile: false });
		expect(await (await post(instanceId, bare, sign(bare))).json()).toEqual({});
		expect(calls.count).toBe(1);
	});

	test("rejects unsigned and wrongly signed calls", async () => {
		mockTarget(KEY);
		const instanceId = instanceIds[1] as string;

		expect((await post(instanceId, payload())).status).toBe(401);
		expect((await post(instanceId, payload(), sign(payload(), "other-key"))).status).toBe(401);
	});

	test("refetches a regenerated key", async () => {
		mockTarget("old-key");
		const instanceId = instanceIds[2] as string;
		expect((await post(instanceId, payload(), sign(payload(), "old-key"))).status).toBe(200);

		for (const spy of spies.splice(0)) spy.mockRestore();
		mockTarget("new-key");
		// The cached key is only refetched after the refresh interval.
		const later = Date.now() + 60_000;
		spies.push(spyOn(Date, "now").mockImplementation(() => later));
		const signature = sign(payload(), "new-key", Math.floor(later / 1000));
		expect((await post(instanceId, payload(), signature)).status).toBe(200);
	});

	test("ignores instances the Zitadel doesn't have, without a lookup each", async () => {
		const calls = mockTarget(KEY);
		expect((await post("9999999", payload(), sign(payload()))).status).toBe(404);
		const lists = calls.lists;
		expect((await post("9999998", payload(), sign(payload()))).status).toBe(404);
		// The instance list is refetched at most once a minute; no signing key is looked up.
		expect(calls.lists).toBe(lists);
		expect(calls.count).toBe(0);
	});
});
