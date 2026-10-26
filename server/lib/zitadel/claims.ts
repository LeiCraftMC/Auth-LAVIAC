/**
 * ZitadelClaims — standard OIDC claims LAVIAC adds to every provisioned instance, built from what
 * Zitadel only sends in its own formats:
 *
 * - `username`: the plain username. With the org domain suffix on (domain policy
 *   `userLoginMustBeDomain`), Zitadel's `preferred_username` is `alice@<org domain>`. Only with
 *   the `profile` scope: Zitadel sends no scopes to actions, but it only puts
 *   `preferred_username` into the userinfo when `profile` was requested.
 * - `groups`: the user's role keys as a flat list (`["devops", "infra-admin"]`), the format apps
 *   like Termix, Grafana or Portainer read. Zitadel sends roles as objects keyed by role
 *   (`urn:zitadel:iam:org:project:roles`, `urn:zitadel:iam:org:project:<id>:roles`) and only when
 *   the project asserts roles or the app asks for them, so `groups` follows the same rules.
 *
 * The provisioning task (server/lib/tasks/provisionInstance.ts) adds an Actions v2 target to the
 * instance and attaches it to the `preuserinfo` function, which runs for the ID token and the
 * userinfo endpoint. Zitadel then calls LAVIAC's webhook (`POST /api/v1/hooks/claims/<instance
 * id>`), whose answer Zitadel merges into the claims. The webhook serves every instance of the
 * Zitadel that has the target, so instances LAVIAC didn't provision can get it by hand.
 *
 * Zitadel signs every call with the target's own key (`ZITADEL-Signature: t=<unix time>,v1=<hex
 * HMAC-SHA256 of "<t>.<body>">`); the webhook reads that key from the instance's target. The
 * target does not interrupt on errors, so while LAVIAC is down logins go on without the claims.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { ConfigHandler } from "../utils/config";
import { ZitadelClient } from "./client";
import type { ZitadelTargetRequest } from "./types";

const SIGNATURE_MAX_AGE_S = 300;
// A signature that doesn't match refetches the key (it may have been regenerated), at most this often.
const KEY_REFRESH_INTERVAL_MS = 30_000;
// An unknown instance id refetches the instance list (it may be new), at most this often.
const INSTANCE_LIST_REFRESH_INTERVAL_MS = 60_000;

const ROLES_CLAIM = "urn:zitadel:iam:org:project:roles";
const PROJECT_ROLES_CLAIM = /^urn:zitadel:iam:org:project:\d+:roles$/;

const signingKeys = new Map<string, { key: string | null; fetchedAt: number }>();
let knownInstances: { ids: Set<string>; fetchedAt: number } | null = null;

/** The plain username, without `@<org primary domain>`; `null` without the profile scope. */
function plainUsername(payload: ZitadelClaims.Payload): string | null {
	if (!payload.userinfo?.preferred_username) return null;

	let username = payload.user?.username ?? "";
	// The username normally has no domain; strip it in case the user was created with one.
	const domain = payload.org?.primary_domain?.toLowerCase();
	if (domain && username.toLowerCase().endsWith(`@${domain}`)) {
		username = username.slice(0, -(domain.length + 1));
	}
	return username || null;
}

/** The role keys of every project roles claim Zitadel put into the userinfo, sorted. */
function roleKeys(userinfo: Record<string, unknown>): string[] {
	const keys = new Set<string>();
	for (const [claim, value] of Object.entries(userinfo)) {
		if (claim !== ROLES_CLAIM && !PROJECT_ROLES_CLAIM.test(claim)) continue;
		if (value && typeof value === "object" && !Array.isArray(value)) {
			for (const role of Object.keys(value)) keys.add(role);
		}
	}
	return [...keys].sort();
}

export namespace ZitadelClaims {
	export const TARGET_NAME = "laviac-claims";
	export const FUNCTION_NAME = "preuserinfo";
	export const WEBHOOK_PATH = "/api/v1/hooks/claims";

	/** The fields of Zitadel's `preuserinfo` payload the webhook reads. */
	export interface Payload {
		userinfo?: { preferred_username?: string } & Record<string, unknown>;
		user?: { username?: string };
		org?: { primary_domain?: string };
	}

	export interface Claim {
		key: string;
		value: string | string[];
	}

	/** The webhook's answer; Zitadel adds `append_claims` to the ID token and userinfo. */
	export interface Answer {
		append_claims?: Claim[];
	}

	export function enabled() {
		return ConfigHandler.getConfig()?.ZITADEL_CLAIMS === true;
	}

	/** The URL the instance's target calls; `null` when the claims are turned off. */
	export function endpoint(instanceId: string): string | null {
		const config = ConfigHandler.getConfig();
		if (!config?.ZITADEL_CLAIMS) return null;
		const base =
			config.ZITADEL_CLAIMS_WEBHOOK_URL ?? `${config.APP_URL.replace(/\/$/, "")}${WEBHOOK_PATH}`;
		return `${base.replace(/\/$/, "")}/${encodeURIComponent(instanceId)}`;
	}

	/** Create the target, or update it when it differs. Returns its id. */
	export async function upsertTarget(instanceHost: string, endpoint: string): Promise<string> {
		const wanted: ZitadelTargetRequest = {
			name: TARGET_NAME,
			endpoint,
			timeout: "10s",
			restCall: { interruptOnError: false },
		};
		const existing = (await ZitadelClient.listTargets(instanceHost)).find(
			(target) => target.name === TARGET_NAME,
		);
		// A 409 here (created by an earlier run the search can't see yet) is retried by the task.
		if (!existing) return ZitadelClient.createTarget(instanceHost, wanted);

		const upToDate =
			existing.endpoint === wanted.endpoint &&
			existing.timeout === wanted.timeout &&
			existing.restCall !== undefined &&
			!existing.restCall.interruptOnError;
		if (!upToDate) await ZitadelClient.updateTarget(instanceHost, existing.id, wanted);
		return existing.id;
	}

	/** Attach the target to `preuserinfo`, after the targets already there. */
	export async function attach(instanceHost: string, targetId: string): Promise<void> {
		const execution = (await ZitadelClient.listExecutions(instanceHost)).find(
			(e) => e.condition.function?.name === FUNCTION_NAME,
		);
		const targets = execution?.targets ?? [];
		if (targets.includes(targetId)) return;
		await ZitadelClient.setExecution(instanceHost, { function: { name: FUNCTION_NAME } }, [
			...targets,
			targetId,
		]);
	}

	/** The claims to add for one `preuserinfo` call; `{}` when there are none. */
	export function answer(payload: Payload): Answer {
		const claims: Claim[] = [];

		const username = plainUsername(payload);
		if (username) claims.push({ key: "username", value: username });

		const groups = roleKeys(payload.userinfo ?? {});
		if (groups.length > 0) claims.push({ key: "groups", value: groups });

		return claims.length > 0 ? { append_claims: claims } : {};
	}

	/** Whether a `ZITADEL-Signature` header signs `body` with `key` and is recent. */
	export function verifySignature(
		header: string | undefined,
		body: string,
		key: string,
		nowS = Math.floor(Date.now() / 1000),
	): boolean {
		let timestamp = "";
		// While a regenerated key is in its grace period, Zitadel sends one v1 per key.
		const signatures: string[] = [];
		for (const part of (header ?? "").split(",")) {
			const [name, value = ""] = part.trim().split("=");
			if (name === "t") timestamp = value;
			if (name === "v1") signatures.push(value);
		}
		if (!/^\d+$/.test(timestamp) || Math.abs(nowS - Number(timestamp)) > SIGNATURE_MAX_AGE_S) {
			return false;
		}

		const expected = createHmac("sha256", key).update(`${timestamp}.${body}`).digest();
		return signatures.some((signature) => {
			const given = Buffer.from(signature, "hex");
			return given.length === expected.length && timingSafeEqual(given, expected);
		});
	}

	/**
	 * Whether `instanceId` is an instance of this Zitadel, provisioned by LAVIAC or not. Random ids
	 * cost at most one instance list request a minute, never a lookup each.
	 */
	export async function isKnownInstance(instanceId: string): Promise<boolean> {
		if (knownInstances?.ids.has(instanceId)) return true;
		if (knownInstances && Date.now() - knownInstances.fetchedAt < INSTANCE_LIST_REFRESH_INTERVAL_MS) {
			return false;
		}
		const instances = await ZitadelClient.listInstances();
		knownInstances = { ids: new Set(instances.map((i) => i.id)), fetchedAt: Date.now() };
		return knownInstances.ids.has(instanceId);
	}

	/** The signing key of the instance's target (cached); `null` when it has none. */
	async function signingKey(instanceId: string, refresh: boolean): Promise<string | null> {
		const cached = signingKeys.get(instanceId);
		if (cached && (!refresh || Date.now() - cached.fetchedAt < KEY_REFRESH_INTERVAL_MS)) {
			return cached.key;
		}

		const host = ZitadelClient.getInstanceHost(await ZitadelClient.getInstance(instanceId));
		const target = host
			? (await ZitadelClient.listTargets(host)).find((t) => t.name === TARGET_NAME)
			: undefined;
		const key = target?.signingKey ?? null;
		signingKeys.set(instanceId, { key, fetchedAt: Date.now() });
		return key;
	}

	/** Whether the call is signed by the instance's target; a mismatch refetches the key once. */
	export async function verify(
		instanceId: string,
		header: string | undefined,
		body: string,
	): Promise<boolean> {
		const key = await signingKey(instanceId, false);
		if (key && verifySignature(header, body, key)) return true;

		const fresh = await signingKey(instanceId, true);
		return fresh !== null && fresh !== key && verifySignature(header, body, fresh);
	}
}
