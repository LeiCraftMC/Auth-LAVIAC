import { TaskHandler } from "@cleverjs/utils";
import { eq } from "drizzle-orm";
import { DB } from "../db";
import { Audit } from "../utils/audit";
import { ZitadelApiError, ZitadelClient } from "../zitadel/client";
import { InstanceTemplates } from "../zitadel/templates";
import type { ZitadelCustomLoginPolicy } from "../zitadel/types";
import { ZitadelTaskSteps } from "./zitadelSteps";

export type ProvisionInstanceArgs = {
	instanceId: string;
	/** `user_sub` of the session that triggered the task — recorded in the audit log. */
	actorSub: string;
};

type ProvisionInstanceState = {
	instanceHost?: string;
	plan?: InstanceTemplates.Plan;
	systemOrgId?: string;
	homeOrgId?: string;
};

type TaskLogger = TaskHandler.BasicTaskLoggerLike;
type PausedRef = Parameters<TaskHandler.SubTaskStepFn>[3];
type Action = [label: string, fn: () => Promise<void>];

/** Run the actions in order, each with its own retries; stop at the first failure or pause. */
async function runActions(
	logger: TaskLogger,
	isPaused: PausedRef,
	actions: Action[],
): Promise<TaskHandler.StepBasedTaskReturn> {
	for (const [label, fn] of actions) {
		const result = await ZitadelTaskSteps.withRetries(label, logger, isPaused, fn);
		if (!result.success || result.paused) return result;
	}
	return { success: true };
}

/** Add the resource, or update it when it exists already (409). */
async function addOrUpdate(add: () => Promise<void>, update: () => Promise<void>) {
	try {
		await add();
	} catch (err) {
		if (!ZitadelTaskSteps.isStatus(err, 409)) throw err;
		await update();
	}
}

/** Swallow `status` (e.g. 409 "already exists", 404 "nothing to remove"). */
async function ignoreStatus(status: number, fn: () => Promise<void>) {
	try {
		await fn();
	} catch (err) {
		if (!ZitadelTaskSteps.isStatus(err, status)) throw err;
	}
}

function orgLoginPolicyAction(
	host: string,
	orgId: string,
	orgLabel: string,
	policy: ZitadelCustomLoginPolicy,
): Action {
	const { secondFactors: _s, multiFactors: _m, ...updateBody } = policy;
	return [
		`${orgLabel}: login policy`,
		() =>
			addOrUpdate(
				() => ZitadelClient.addOrgLoginPolicy(host, orgId, policy),
				() => ZitadelClient.updateOrgLoginPolicy(host, orgId, updateBody),
			),
	];
}

function updateSetup(instanceId: string, values: Partial<DB.Models.InstanceSetup>) {
	DB.instance()
		.update(DB.Tables.instanceSetups)
		.set(values)
		.where(eq(DB.Tables.instanceSetups.instance_id, instanceId))
		.run();
}

function requireState(state: ProvisionInstanceState) {
	if (!state.instanceHost || !state.plan || !state.systemOrgId) {
		throw new Error("The instance was not resolved");
	}
	return { host: state.instanceHost, plan: state.plan, systemOrgId: state.systemOrgId };
}

/**
 * Applies the instance's template (server/lib/zitadel/templates.ts): locks down the SYSTEM org,
 * writes the security baseline and the template's instance defaults, creates the home org and
 * makes it the default org. The template and its options come from the `instance_setups` row.
 *
 * Every write is idempotent: a LAVIAC restart runs the task again from the first step (a step-based
 * task only keeps its state when paused), and the dashboard can re-apply it.
 */
export const ProvisionInstanceTask = new TaskHandler.StepBasedTaskFn(
	"provisionInstance",
	async (args: ProvisionInstanceArgs, logger, state: ProvisionInstanceState, isPaused) => {
		const setup = DB.instance()
			.select()
			.from(DB.Tables.instanceSetups)
			.where(eq(DB.Tables.instanceSetups.instance_id, args.instanceId))
			.get();
		if (!setup) {
			return { success: false, message: `Instance ${args.instanceId} has no template` };
		}

		state.plan = InstanceTemplates.resolve(setup.template, setup.options);
		logger.info(`Applying the ${InstanceTemplates.definition(setup.template).name} template.`);

		return runActions(logger, isPaused, [
			[
				"Resolving the instance domain",
				async () => {
					state.instanceHost = await ZitadelTaskSteps.runningInstanceHost(args.instanceId);
					logger.info(`Using instance host ${state.instanceHost}.`);
				},
			],
			[
				"Resolving the SYSTEM org",
				async () => {
					const host = state.instanceHost as string;
					let systemOrgId = setup.system_org_id;
					if (!systemOrgId) {
						const org = await ZitadelClient.findOrgByName(host, InstanceTemplates.SYSTEM_ORG_NAME);
						// Zitadel's projections may still lag right after the instance was created.
						if (!org) throw new Error(`No org named ${InstanceTemplates.SYSTEM_ORG_NAME} yet`);
						systemOrgId = org.id;
						updateSetup(args.instanceId, { system_org_id: systemOrgId });
					}
					state.systemOrgId = systemOrgId;
					logger.info(`SYSTEM org: ${systemOrgId}.`);
				},
			],
		]);
	},
)
	.addStep("Lock down the SYSTEM org", async (_args, logger, state, isPaused) => {
		const { host, plan, systemOrgId } = requireState(state);
		const org = plan.systemOrg;
		const actions: Action[] = [];

		// Before the instance domain policy changes (next step): Zitadel rewrites the usernames of
		// every org without its own domain policy when the suffix setting flips, and the initial
		// admin must keep its plain username.
		if (org.domainPolicy) {
			const domainPolicy = org.domainPolicy;
			actions.push([
				"SYSTEM org: domain policy",
				() =>
					addOrUpdate(
						() => ZitadelClient.addOrgDomainPolicy(host, systemOrgId, domainPolicy),
						() => ZitadelClient.updateOrgDomainPolicy(host, systemOrgId, domainPolicy),
					),
			]);
		}
		if (org.loginPolicy) {
			actions.push(orgLoginPolicyAction(host, systemOrgId, "SYSTEM org", org.loginPolicy));
		}
		actions.push([
			"SYSTEM org: role metadata",
			() =>
				ZitadelClient.setOrgMetadata(
					host,
					systemOrgId,
					InstanceTemplates.ORG_ROLE_METADATA_KEY,
					org.role,
				),
		]);

		return runActions(logger, isPaused, actions);
	})
	.addStep("Apply the instance defaults", async (_args, logger, state, isPaused) => {
		const { host, plan } = requireState(state);
		const instance = plan.instance;

		return runActions(logger, isPaused, [
			["Security policy", () => ZitadelClient.setSecurityPolicy(host, instance.security)],
			[
				"Password complexity policy",
				() => ZitadelClient.updateDefaultPasswordComplexityPolicy(host, instance.passwordComplexity),
			],
			["Lockout policy", () => ZitadelClient.updateDefaultLockoutPolicy(host, instance.lockout)],
			["OIDC token lifetimes", () => ZitadelClient.updateOIDCSettings(host, instance.oidc)],
			[
				"Org registration restriction",
				() => ZitadelClient.setRestrictions(host, instance.restrictions),
			],
			[
				"Default login policy",
				() => ZitadelClient.updateDefaultLoginPolicy(host, instance.loginPolicy),
			],
			[
				"Default domain policy",
				() => ZitadelClient.updateDefaultDomainPolicy(host, instance.domainPolicy),
			],
		]);
	})
	.addStep("Create the home org", async (args, logger, state, isPaused) => {
		const { host, plan } = requireState(state);
		const org = plan.homeOrg;
		if (!org) {
			logger.info("The template has no home org.");
			return { success: true };
		}

		return runActions(logger, isPaused, [
			[
				`Creating the org ${org.name}`,
				async () => {
					const stored = DB.instance()
						.select({ homeOrgId: DB.Tables.instanceSetups.home_org_id })
						.from(DB.Tables.instanceSetups)
						.where(eq(DB.Tables.instanceSetups.instance_id, args.instanceId))
						.get();

					let homeOrgId = stored?.homeOrgId ?? (await ZitadelClient.findOrgByName(host, org.name))?.id;
					if (!homeOrgId) {
						try {
							homeOrgId = await ZitadelClient.addOrg(host, org.name);
						} catch (err) {
							// Created by an earlier run the search can't see yet: retry the search.
							if (ZitadelTaskSteps.isStatus(err, 409)) {
								throw new Error(`The org ${org.name} exists but is not searchable yet`);
							}
							throw err;
						}
					}

					updateSetup(args.instanceId, { home_org_id: homeOrgId });
					state.homeOrgId = homeOrgId;
					logger.info(`Home org ${org.name}: ${homeOrgId}.`);
				},
			],
			[
				`${org.name}: role metadata`,
				() =>
					ZitadelClient.setOrgMetadata(
						host,
						state.homeOrgId as string,
						InstanceTemplates.ORG_ROLE_METADATA_KEY,
						org.role,
					),
			],
		]);
	})
	.addStep("Configure the home org", async (_args, logger, state, isPaused) => {
		const { host, plan } = requireState(state);
		const org = plan.homeOrg;
		const homeOrgId = state.homeOrgId;
		if (!org || !homeOrgId) return { success: true };

		const actions: Action[] = [];
		if (org.loginPolicy) {
			actions.push(orgLoginPolicyAction(host, homeOrgId, org.name, org.loginPolicy));
		}

		const domain = org.domain;
		if (domain) {
			// LAVIAC vouches for the domain: a temporary org domain policy without validation lets
			// Zitadel verify it on add. Same suffix setting as the instance, so no username changes.
			const unvalidated = { ...plan.instance.domainPolicy, validateOrgDomains: false };
			actions.push(
				[
					`${org.name}: skip domain validation`,
					() =>
						addOrUpdate(
							() => ZitadelClient.addOrgDomainPolicy(host, homeOrgId, unvalidated),
							() => ZitadelClient.updateOrgDomainPolicy(host, homeOrgId, unvalidated),
						),
				],
				[
					`${org.name}: add the domain ${domain}`,
					() => ignoreStatus(409, () => ZitadelClient.addOrgDomain(host, homeOrgId, domain)),
				],
				[
					`${org.name}: make ${domain} the primary domain`,
					async () => {
						try {
							await ZitadelClient.setPrimaryOrgDomain(host, homeOrgId, domain);
						} catch (err) {
							if (ZitadelTaskSteps.isStatus(err, 404)) {
								throw new ZitadelApiError(
									400,
									`The domain ${domain} is not on the org; another org of the instance may hold it`,
								);
							}
							throw err;
						}
					},
				],
				[
					`${org.name}: restore domain validation`,
					() => ignoreStatus(404, () => ZitadelClient.resetOrgDomainPolicy(host, homeOrgId)),
				],
			);
		}

		return runActions(logger, isPaused, actions);
	})
	.addStep("Make the home org the default org", async (args, logger, state, isPaused) => {
		const { host, plan } = requireState(state);
		const homeOrgId = state.homeOrgId;

		const actions: Action[] = [];
		if (plan.homeOrg && homeOrgId) {
			actions.push(["Setting the default org", () => ZitadelClient.setDefaultOrg(host, homeOrgId)]);
		} else {
			logger.info("The SYSTEM org stays the default org.");
		}

		const result = await runActions(logger, isPaused, actions);
		if (result.success && !result.paused) {
			await Audit.log(args.actorSub, "instance.template.apply", args.instanceId, plan.template);
			logger.info("Template applied.");
		}
		return result;
	});
