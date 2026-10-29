/**
 * ZitadelClaims — claims LAVIAC adds to every instance of the Zitadel, built from what Zitadel
 * only sends in its own formats:
 *
 * - `urn:lcmc-auth:username`: the plain username. With the org domain suffix on (domain policy
 *   `userLoginMustBeDomain`), Zitadel's `preferred_username` is `alice@<org domain>`. Only with
 *   the `profile` scope: Zitadel sends no scopes to actions, but it only puts
 *   `preferred_username` into the userinfo when `profile` was requested. With the suffix on,
 *   Zitadel keeps usernames unique only within an org, so two orgs can each have an `alice`.
 * - `urn:lcmc-auth:roles`: the role keys in the app's own project as a list
 *   (`["devops", "infra-admin"]`), the format apps like Termix, Grafana or Portainer read. Zitadel
 *   sends roles as objects keyed by role, only when the project asserts roles or the app asks for
 *   them, so these claims follow the same rules.
 * - `urn:lcmc-auth:project-roles`: `<project id>:<role key>` for every project whose roles Zitadel
 *   sent: the app's own, and those the app asks for by scope (`urn:zitadel:iam:org:projects:roles`
 *   plus `urn:zitadel:iam:org:project:id:<id>:aud`).
 *
 * Roles of different projects stay apart: the same role key can mean different things in two
 * projects, so `roles` holds the app's own project only, and `project-roles` names the project in
 * every entry. Project ids are digits, so the first `:` ends the id whatever the role key holds
 * (Zitadel puts no limit on its characters). Plain and qualified entries never share a claim: a
 * role key such as `<other project id>:admin` could pass for another project's role there.
 *
 * The names are namespaced because Zitadel drops a claim from an action when the key is already
 * set, and keeps names to itself: everything under `urn:zitadel:iam`, and from v5 (on its main
 * branch, not in v4.20.0) `groups`, filled with the names of Zitadel's user groups, which any org
 * admin can create.
 *
 * {@link ZitadelClaims.sync} gives an instance the Actions v2 target `laviac-claims` and attaches
 * it to the `preuserinfo` function (ID token and userinfo) and `preaccesstoken` (JWT access
 * tokens). The provisioning task (server/lib/tasks/provisionInstance.ts) runs it for a new
 * instance, the `syncClaims` task (server/lib/tasks/syncClaims.ts) for every instance at startup
 * and every 6 hours. Zitadel then calls LAVIAC's webhook (`POST /api/v1/hooks/claims/<instance
 * id>`), whose answer Zitadel merges into the claims.
 *
 * Zitadel signs every call with the target's own key (`ZITADEL-Signature: t=<unix time>,v1=<hex
 * HMAC-SHA256 of "<t>.<body>">`); the webhook reads that key from the instance's target. The
 * target does not interrupt on errors, so while LAVIAC is down logins go on without the claims.
 *
 * Zitadel's discovery document (`claims_supported`) can't list these claims: Zitadel v4 fills it
 * from a fixed list, without its own `urn:zitadel:*` claims either. Apps don't need it listed.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP, isIPv4 } from "node:net";
import { ConfigHandler } from "../utils/config";
import { ZitadelApiError, ZitadelClient } from "./client";
import type { ZitadelExecutionCondition, ZitadelTarget, ZitadelTargetRequest } from "./types";

const SIGNATURE_MAX_AGE_S = 300;
// A signature that doesn't match refetches the key (it may have been regenerated), at most this often.
const KEY_REFRESH_INTERVAL_MS = 30_000;
// An unknown instance id refetches the instance list (it may be new), at most this often.
const INSTANCE_LIST_REFRESH_INTERVAL_MS = 60_000;

// Zitadel's roles claims: the app's own project, and one per project with its id.
const ROLES_CLAIM = "urn:zitadel:iam:org:project:roles";
const PROJECT_ROLES_CLAIM = /^urn:zitadel:iam:org:project:(\d+):roles$/;

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

/** The role keys of one Zitadel roles claim (role key → { org id: org domain }). */
function roleKeys(value: unknown): string[] {
	return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

/** `<project id>:<role key>` for every project roles claim Zitadel put into the userinfo, sorted. */
function projectRoles(userinfo: Record<string, unknown>): string[] {
	const entries: string[] = [];
	for (const [claim, value] of Object.entries(userinfo)) {
		const projectId = PROJECT_ROLES_CLAIM.exec(claim)?.[1];
		if (projectId) entries.push(...roleKeys(value).map((role) => `${projectId}:${role}`));
	}
	return entries.sort();
}

/**
 * `current` with `ownId` in the place of the first legacy target (or appended), the other legacy
 * targets dropped, and every id once.
 */
function withTarget(current: string[], ownId: string, legacyIds: Set<string>): string[] {
	const next: string[] = [];
	for (const id of current) {
		const kept = legacyIds.has(id) ? ownId : id;
		if (!next.includes(kept)) next.push(kept);
	}
	if (!next.includes(ownId)) next.push(ownId);
	return next;
}

/** Whether `ip` is in Zitadel's default deny list (`ZITADEL_HTTPCLIENT_DENYLIST`, v4.19.4–v4.20.0). */
function deniedAddress(ip: string): boolean {
	const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	const address = mapped?.[1] ?? ip.toLowerCase();
	if (isIPv4(address)) {
		const [a = 0, b = 0] = address.split(".").map(Number);
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 198 && (b === 18 || b === 19))
		);
	}
	return (
		address === "::" || address === "::1" || /^f[cd]/.test(address) || /^fe[89ab]/.test(address)
	);
}

/**
 * Why Zitadel would refuse to call `url`, or `null`. Zitadel's dialer checks the resolved
 * addresses against its deny list, so the name is resolved here the same way: LAVIAC runs next to
 * Zitadel and uses the same resolver. The self-test can't see this; LAVIAC has no deny list.
 */
async function refusedByZitadel(url: string): Promise<string | null> {
	let host: string;
	try {
		host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
	} catch {
		return `${url} is not a URL`;
	}
	const fix = "set LAVIAC_ZITADEL_CLAIMS_WEBHOOK_URL to a public URL of LAVIAC";
	if (host === "localhost" || host.endsWith(".localhost")) {
		return `Zitadel refuses targets on ${host}; ${fix}`;
	}

	let addresses: string[];
	try {
		addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
	} catch (err) {
		return `${host} does not resolve: ${err instanceof Error ? err.message : String(err)}`;
	}
	const denied = addresses.find(deniedAddress);
	return denied
		? `${host} resolves to ${denied}, and Zitadel refuses targets on private addresses; ${fix}`
		: null;
}

function sameList(a: string[], b: string[]) {
	return a.length === b.length && a.every((id, i) => id === b[i]);
}

function conditionLabel(condition: ZitadelExecutionCondition) {
	return condition.function?.name ?? JSON.stringify(condition);
}

async function deleteTargetIfThere(instanceHost: string, id: string) {
	try {
		await ZitadelClient.deleteTarget(instanceHost, id);
	} catch (err) {
		if (!(err instanceof ZitadelApiError && err.status === 404)) throw err;
	}
}

export namespace ZitadelClaims {
	/** The names of the claims LAVIAC adds. */
	export const CLAIMS = {
		username: "urn:lcmc-auth:username",
		roles: "urn:lcmc-auth:roles",
		projectRoles: "urn:lcmc-auth:project-roles",
	} as const;
	export const TARGET_NAME = "laviac-claims";
	/** `preuserinfo` runs for the ID token and userinfo, `preaccesstoken` for JWT access tokens. */
	export const FUNCTION_NAMES = ["preuserinfo", "preaccesstoken"] as const;
	/**
	 * Targets the claims target replaces, removed once it answers: LAVIAC's own before the claims
	 * were generic, and the PHP script it took over from (Deployment/actions/claims).
	 */
	export const LEGACY_TARGET_NAMES: readonly string[] = [
		"laviac-username-claim",
		"clean-username-target",
	];
	// The webhook answers in milliseconds; a call that hangs holds up the token until the timeout.
	export const TARGET_TIMEOUT = "5s";
	export const WEBHOOK_PATH = "/api/v1/hooks/claims";
	/** The username of the self-test call ({@link selfTest}). */
	export const SELF_TEST_USER = "laviac-self-test";

	/** The fields of Zitadel's `preuserinfo` / `preaccesstoken` payload the webhook reads. */
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

	/** What {@link sync} did to one instance. */
	export interface SyncResult {
		/** One line per change, for the task log; empty when everything was in order. */
		changes: string[];
		/** Why the target was left detached (the webhook did not answer); `null` otherwise. */
		problem: string | null;
	}

	/**
	 * Bring one instance in line: LAVIAC's target exists with the current endpoint, runs on
	 * {@link FUNCTION_NAMES} and has replaced the legacy targets. Nothing is written when Zitadel
	 * would refuse the endpoint (localhost, private addresses). The target is only attached, and
	 * the legacy ones only removed, once {@link selfTest} gets an answer from the webhook: an
	 * unreachable target would hold up every token for its timeout. With the claims off, LAVIAC's
	 * own target is removed and the legacy ones stay (they may be all there is).
	 *
	 * The instance's other targets and executions are kept. Zitadel errors are thrown (the callers
	 * retry); every write is idempotent.
	 */
	export async function sync(instanceId: string, instanceHost: string): Promise<SyncResult> {
		const changes: string[] = [];
		const targets = await ZitadelClient.listTargets(instanceHost);
		const executions = await ZitadelClient.listExecutions(instanceHost);
		const own = targets.find((target) => target.name === TARGET_NAME);
		const url = endpoint(instanceId);

		if (!url) {
			if (own) {
				for (const execution of executions) {
					const current = execution.targets ?? [];
					if (!current.includes(own.id)) continue;
					// An empty list removes the execution.
					await ZitadelClient.setExecution(
						instanceHost,
						execution.condition,
						current.filter((id) => id !== own.id),
					);
					changes.push(`detached ${TARGET_NAME} from ${conditionLabel(execution.condition)}`);
				}
				await deleteTargetIfThere(instanceHost, own.id);
				changes.push(`deleted ${TARGET_NAME} (LAVIAC_ZITADEL_CLAIMS=false)`);
			}
			return { changes, problem: null };
		}

		// Before any write: a target Zitadel can't call is no use, and the legacy ones must stay.
		const refused = await refusedByZitadel(url);
		if (refused) return { changes, problem: refused };

		const target = await upsertTarget(instanceHost, url, own, changes);
		// The self-test goes through the webhook, which must know the instance and the key. The
		// instance is added without making the rest of the list count as fresh.
		knownInstances ??= { ids: new Set(), fetchedAt: 0 };
		knownInstances.ids.add(instanceId);
		signingKeys.set(instanceId, { key: target.signingKey, fetchedAt: Date.now() });

		const problem = await ZitadelClaims.selfTest(url, target.signingKey);
		if (problem) return { changes, problem };

		const legacy = targets.filter((t) => LEGACY_TARGET_NAMES.includes(t.name));
		const legacyIds = new Set(legacy.map((t) => t.id));
		const legacyNames = (ids: string[]) =>
			ids.map((id) => legacy.find((t) => t.id === id)?.name ?? id).join(", ");

		// One write per changed execution, all computed from the list read above: a list read
		// again after the writes may still show the old state.
		const missing = new Set<string>(FUNCTION_NAMES);
		for (const execution of executions) {
			const current = execution.targets ?? [];
			const fn = execution.condition.function?.name;
			const ours = fn !== undefined && missing.delete(fn);
			const next = ours
				? withTarget(current, target.id, legacyIds)
				: current.filter((id) => !legacyIds.has(id));
			if (sameList(current, next)) continue;

			await ZitadelClient.setExecution(instanceHost, execution.condition, next);
			const label = conditionLabel(execution.condition);
			if (ours && !current.includes(target.id)) changes.push(`attached ${TARGET_NAME} to ${label}`);
			const removed = current.filter((id) => legacyIds.has(id));
			if (removed.length > 0) changes.push(`took ${legacyNames(removed)} out of ${label}`);
		}
		for (const fn of missing) {
			await ZitadelClient.setExecution(instanceHost, { function: { name: fn } }, [target.id]);
			changes.push(`attached ${TARGET_NAME} to ${fn}`);
		}

		for (const old of legacy) {
			await deleteTargetIfThere(instanceHost, old.id);
			changes.push(`deleted the legacy target ${old.name}`);
		}
		return { changes, problem: null };
	}

	/** Create LAVIAC's target, or update it when it differs; its id and signing key. */
	async function upsertTarget(
		instanceHost: string,
		url: string,
		existing: ZitadelTarget | undefined,
		changes: string[],
	): Promise<{ id: string; signingKey: string | null }> {
		const wanted: ZitadelTargetRequest = {
			name: TARGET_NAME,
			endpoint: url,
			timeout: TARGET_TIMEOUT,
			restCall: { interruptOnError: false },
		};
		if (!existing) {
			// A 409 here (created by an earlier run the search can't see yet) is retried by the caller.
			const created = await ZitadelClient.createTarget(instanceHost, wanted);
			changes.push(`created ${TARGET_NAME} calling ${url}`);
			return { id: created.id, signingKey: created.signingKey ?? null };
		}

		const upToDate =
			existing.endpoint === wanted.endpoint &&
			existing.timeout === wanted.timeout &&
			existing.restCall !== undefined &&
			!existing.restCall.interruptOnError;
		if (!upToDate) {
			// The signing key stays the same.
			await ZitadelClient.updateTarget(instanceHost, existing.id, wanted);
			changes.push(`updated ${TARGET_NAME} to call ${url}`);
		}
		return { id: existing.id, signingKey: existing.signingKey ?? null };
	}

	/**
	 * Call the webhook at `url` the way Zitadel does, signed with the target's key. Returns the
	 * problem, or `null` when it answers with the claims. LAVIAC runs next to Zitadel, so this is
	 * Zitadel's way to the webhook too; only Zitadel's deny list of private addresses differs.
	 */
	export async function selfTest(url: string, signingKey: string | null): Promise<string | null> {
		if (!signingKey) return "Zitadel returned no signing key for the target";

		const body = JSON.stringify({
			function: "function/preuserinfo",
			userinfo: { sub: SELF_TEST_USER, preferred_username: `${SELF_TEST_USER}@self-test.invalid` },
			user: { username: SELF_TEST_USER },
		});
		const t = Math.floor(Date.now() / 1000);
		const signature = createHmac("sha256", signingKey).update(`${t}.${body}`).digest("hex");
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json", "ZITADEL-Signature": `t=${t},v1=${signature}` },
				body,
				signal: AbortSignal.timeout(10_000),
			});
			if (!res.ok) return `the webhook answered HTTP ${res.status} at ${url}`;
			const answer = (await res.json()) as Answer;
			const ok = answer.append_claims?.some(
				(claim) => claim.key === CLAIMS.username && claim.value === SELF_TEST_USER,
			);
			return ok ? null : `the webhook at ${url} answered without the claims`;
		} catch (err) {
			return `the webhook is unreachable at ${url}: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	/** The claims to add for one `preuserinfo` / `preaccesstoken` call; `{}` when there are none. */
	export function answer(payload: Payload): Answer {
		const claims: Claim[] = [];

		const username = plainUsername(payload);
		if (username) claims.push({ key: CLAIMS.username, value: username });

		const userinfo = payload.userinfo ?? {};
		const roles = roleKeys(userinfo[ROLES_CLAIM]).sort();
		if (roles.length > 0) claims.push({ key: CLAIMS.roles, value: roles });
		const qualified = projectRoles(userinfo);
		if (qualified.length > 0) claims.push({ key: CLAIMS.projectRoles, value: qualified });

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
