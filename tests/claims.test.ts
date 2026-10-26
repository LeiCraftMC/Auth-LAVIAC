import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createHmac } from "node:crypto";
import { API } from "../server/lib/api";
import { ZitadelClaims } from "../server/lib/zitadel/claims";
import { ZitadelClient } from "../server/lib/zitadel/client";

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

describe("Claims answer", () => {
	test("username: the plain username with the profile scope, nothing without", () => {
		expect(answer(payload())).toEqual({ append_claims: [{ key: "username", value: "alice" }] });
		expect(answer(payload({ profile: false }))).toEqual({});
	});

	test("username: strips the org domain from a username created with it", () => {
		const claims = answer(payload({ username: "Alice@ACME.example.com" })).append_claims;
		expect(claims?.[0]?.value).toBe("Alice");
	});

	test("groups: the role keys of every project roles claim, sorted and once each", () => {
		const body = payload({
			profile: false,
			userinfo: {
				"urn:zitadel:iam:org:project:roles": roleMap("termix", "devops"),
				"urn:zitadel:iam:org:project:111:roles": roleMap("termix", "devops"),
				"urn:zitadel:iam:org:project:222:roles": roleMap("grafana-viewer"),
				// Not a roles claim.
				"urn:zitadel:iam:user:resourceowner:name": "Acme",
			},
		});
		expect(answer(body)).toEqual({
			append_claims: [{ key: "groups", value: ["devops", "grafana-viewer", "termix"] }],
		});
	});

	test("groups: nothing when Zitadel sends no roles", () => {
		expect(answer(payload({ profile: false, userinfo: {} }))).toEqual({});
	});

	test("username and groups together", () => {
		const body = payload({ userinfo: { "urn:zitadel:iam:org:project:roles": roleMap("admin") } });
		expect(answer(body)).toEqual({
			append_claims: [
				{ key: "username", value: "alice" },
				{ key: "groups", value: ["admin"] },
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

	test("the endpoint defaults to LAVIAC's own webhook", () => {
		expect(ZitadelClaims.endpoint("123")).toBe("http://localhost:12191/api/v1/hooks/claims/123");
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

		const body = payload({ userinfo: { "urn:zitadel:iam:org:project:roles": roleMap("devops") } });
		const res = await post(instanceId, body, sign(body));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			append_claims: [
				{ key: "username", value: "alice" },
				{ key: "groups", value: ["devops"] },
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
