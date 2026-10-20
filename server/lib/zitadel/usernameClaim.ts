/**
 * ZitadelUsernameClaim — the `username` claim LAVIAC gives every provisioned instance.
 *
 * With the org domain suffix on (domain policy `userLoginMustBeDomain`), Zitadel's
 * `preferred_username` is `alice@<org domain>`. The provisioning task
 * (server/lib/tasks/provisionInstance.ts) adds an Actions v2 target to the instance and attaches
 * it to the `preuserinfo` function, which runs for the ID token and the userinfo endpoint. Zitadel
 * then calls LAVIAC's webhook (`POST /api/v1/hooks/username-claim/<instance id>`), which answers
 * with a `username` claim holding the plain username.
 *
 * The claim is only added when the `profile` scope was requested: Zitadel sends no scopes to
 * actions, but it only puts `preferred_username` into the userinfo when `profile` was requested.
 *
 * Zitadel signs every call with the target's own key (`ZITADEL-Signature: t=<unix time>,v1=<hex
 * HMAC-SHA256 of "<t>.<body>">`); the webhook reads that key from the instance's target. The
 * target does not interrupt on errors, so while LAVIAC is down logins go on without the claim.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { ConfigHandler } from "../utils/config";
import { ZitadelClient } from "./client";
import type { ZitadelTargetRequest } from "./types";

const SIGNATURE_MAX_AGE_S = 300;
// A signature that doesn't match refetches the key (it may have been regenerated), at most this often.
const KEY_REFRESH_INTERVAL_MS = 30_000;

const signingKeys = new Map<string, { key: string | null; fetchedAt: number }>();

export namespace ZitadelUsernameClaim {
	export const TARGET_NAME = "laviac-username-claim";
	export const FUNCTION_NAME = "preuserinfo";
	export const CLAIM_KEY = "username";
	export const WEBHOOK_PATH = "/api/v1/hooks/username-claim";

	/** The fields of Zitadel's `preuserinfo` payload the webhook reads. */
	export interface Payload {
		userinfo?: { preferred_username?: string };
		user?: { username?: string };
		org?: { primary_domain?: string };
	}

	/** The webhook's answer; Zitadel adds `append_claims` to the ID token and userinfo. */
	export interface Answer {
		append_claims?: { key: string; value: string }[];
	}

	export function enabled() {
		return ConfigHandler.getConfig()?.ZITADEL_USERNAME_CLAIM === true;
	}

	/** The URL the instance's target calls; `null` when the claim is turned off. */
	export function endpoint(instanceId: string): string | null {
		const config = ConfigHandler.getConfig();
		if (!config?.ZITADEL_USERNAME_CLAIM) return null;
		const base =
			config.ZITADEL_USERNAME_CLAIM_WEBHOOK_URL ??
			`${config.APP_URL.replace(/\/$/, "")}${WEBHOOK_PATH}`;
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

	/** The plain username, without `@<org primary domain>`; nothing without the profile scope. */
	export function answer(payload: Payload): Answer {
		if (!payload.userinfo?.preferred_username) return {};

		let username = payload.user?.username ?? "";
		// The username normally has no domain; strip it in case the user was created with one.
		const domain = payload.org?.primary_domain?.toLowerCase();
		if (domain && username.toLowerCase().endsWith(`@${domain}`)) {
			username = username.slice(0, -(domain.length + 1));
		}
		return username ? { append_claims: [{ key: CLAIM_KEY, value: username }] } : {};
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
