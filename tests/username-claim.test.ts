import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { createHmac } from "node:crypto";
import { API } from "../server/lib/api";
import { DB } from "../server/lib/db";
import { ZitadelClient } from "../server/lib/zitadel/client";
import { ZitadelUsernameClaim } from "../server/lib/zitadel/usernameClaim";

const KEY = "test-signing-key";

const now = () => Math.floor(Date.now() / 1000);

function sign(body: string, key = KEY, t = now()) {
	return `t=${t},v1=${createHmac("sha256", key).update(`${t}.${body}`).digest("hex")}`;
}

/** A `preuserinfo` payload as Zitadel sends it (trimmed); `profile` decides preferred_username. */
function payload(profile = true, username = "alice") {
	return JSON.stringify({
		function: "function/preuserinfo",
		userinfo: {
			sub: "1",
			...(profile ? { preferred_username: `${username}@acme.example.com` } : {}),
		},
		user: { id: "1", username, preferred_login_name: "alice@acme.example.com" },
		org: { id: "2", name: "Acme", primary_domain: "acme.example.com" },
		user_metadata: [],
		user_grants: [],
	});
}

describe("Username claim answer", () => {
	test("is the plain username with the profile scope, nothing without", () => {
		expect(ZitadelUsernameClaim.answer(JSON.parse(payload()))).toEqual({
			append_claims: [{ key: "username", value: "alice" }],
		});
		expect(ZitadelUsernameClaim.answer(JSON.parse(payload(false)))).toEqual({});
	});

	test("strips the org domain from a username created with it", () => {
		const answer = ZitadelUsernameClaim.answer(JSON.parse(payload(true, "Alice@ACME.example.com")));
		expect(answer.append_claims?.[0]?.value).toBe("Alice");
	});

	test("accepts only recent signatures made with the key", () => {
		const body = payload();
		expect(ZitadelUsernameClaim.verifySignature(sign(body), body, KEY)).toBe(true);
		// One of several v1 values (a regenerated key in its grace period) is enough.
		const both = `${sign(body, "old-key")},v1=${sign(body).split("v1=")[1]}`;
		expect(ZitadelUsernameClaim.verifySignature(both, body, KEY)).toBe(true);

		expect(ZitadelUsernameClaim.verifySignature(sign(body, "other-key"), body, KEY)).toBe(false);
		expect(ZitadelUsernameClaim.verifySignature(sign(body), `${body} `, KEY)).toBe(false);
		expect(ZitadelUsernameClaim.verifySignature(sign(body, KEY, now() - 600), body, KEY)).toBe(false);
		expect(ZitadelUsernameClaim.verifySignature(undefined, body, KEY)).toBe(false);
		expect(ZitadelUsernameClaim.verifySignature("t=abc,v1=zz", body, KEY)).toBe(false);
	});

	test("the endpoint defaults to LAVIAC's own webhook", () => {
		expect(ZitadelUsernameClaim.endpoint("123")).toBe(
			"http://localhost:12191/api/v1/hooks/username-claim/123",
		);
	});
});

describe("Username claim webhook", () => {
	const spies: { mockRestore(): void }[] = [];
	afterEach(() => {
		for (const spy of spies.splice(0)) spy.mockRestore();
	});

	const instanceIds = ["9000001", "9000002", "9000003"];
	beforeAll(() => {
		for (const instance_id of instanceIds) {
			DB.instance()
				.insert(DB.Tables.instanceSetups)
				.values({ instance_id, template: "minimal", options: {}, created_by_user_sub: "test" })
				.run();
		}
	});

	/** The instance's target signs with `key`; returns how often Zitadel was asked for it. */
	function mockTarget(key: string) {
		const calls = { count: 0 };
		spies.push(
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
					name: ZitadelUsernameClaim.TARGET_NAME,
					endpoint: "http://localhost",
					signingKey: key,
				},
			]) as never),
		);
		return calls;
	}

	function post(instanceId: string, body: string, signature?: string) {
		return API.getApp().request(`/v1/hooks/username-claim/${instanceId}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(signature ? { "ZITADEL-Signature": signature } : {}),
			},
			body,
		});
	}

	test("answers a signed call with the claim and caches the key", async () => {
		const calls = mockTarget(KEY);
		const [instanceId] = instanceIds as [string];

		const res = await post(instanceId, payload(), sign(payload()));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ append_claims: [{ key: "username", value: "alice" }] });

		const withoutProfile = await post(instanceId, payload(false), sign(payload(false)));
		expect(await withoutProfile.json()).toEqual({});
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

	test("ignores instances LAVIAC did not provision", async () => {
		const calls = mockTarget(KEY);
		const res = await post("9999999", payload(), sign(payload()));
		expect(res.status).toBe(404);
		expect(calls.count).toBe(0);
	});
});
