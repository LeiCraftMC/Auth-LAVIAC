import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { InstanceTemplatesModel } from "../server/lib/api/versions/v1/routes/instance-templates/model";
import { DB } from "../server/lib/db";
import { ProvisionInstanceTask } from "../server/lib/tasks/provisionInstance";
import { ZitadelApiError, ZitadelClient } from "../server/lib/zitadel/client";
import { InstanceTemplates } from "../server/lib/zitadel/templates";
import { makeAPIRequest } from "./helpers/api";
import { seedSession } from "./helpers/seed";

describe("Instance templates", () => {
	test("every template locks down the SYSTEM org the same way", () => {
		const plans = InstanceTemplates.IDS.map((id) =>
			InstanceTemplates.resolve(id, { homeOrgName: "Acme" }),
		);
		const [first] = plans;
		for (const plan of plans) {
			expect(plan.systemOrg.name).toBe("SYSTEM");
			expect(plan.systemOrg.loginPolicy).toMatchObject({
				allowRegister: false,
				allowExternalIdp: false,
				forceMfa: true,
				forceMfaLocalOnly: false,
			});
			expect(plan.systemOrg.domainPolicy?.userLoginMustBeDomain).toBe(false);
			expect(plan.systemOrg).toEqual(first?.systemOrg as InstanceTemplates.OrgPlan);
		}
	});

	test("the security baseline is the same for every template", () => {
		for (const id of InstanceTemplates.IDS) {
			const { instance } = InstanceTemplates.resolve(id, { homeOrgName: "Acme" });
			expect(instance.passwordComplexity.minLength).toBe(12);
			expect(instance.lockout).toEqual({ maxPasswordAttempts: 0, maxOtpAttempts: 5 });
			expect(instance.security).toEqual({
				enableIframeEmbedding: false,
				allowedOrigins: [],
				enableImpersonation: false,
			});
			expect(instance.oidc.accessTokenLifetime).toBe("3600s");
			expect(instance.oidc.idTokenLifetime).toBe("3600s");
			expect(instance.loginPolicy.allowRegister).toBe(false);
			expect(instance.loginPolicy.ignoreUnknownUsernames).toBe(true);
			expect(instance.loginPolicy.disableLoginWithPhone).toBe(true);
			expect(instance.domainPolicy.validateOrgDomains).toBe(true);
		}
	});

	test("private: one company org, MFA required, plain login names, no sign-up", () => {
		const plan = InstanceTemplates.resolve("private", {
			homeOrgName: "Acme",
			allowOrgRegistration: true,
		});
		expect(plan.instance.loginPolicy).toMatchObject({
			allowRegister: false,
			forceMfa: true,
			forceMfaLocalOnly: true,
		});
		expect(plan.instance.domainPolicy.userLoginMustBeDomain).toBe(false);
		// The private template never asks: org sign-up stays closed.
		expect(plan.instance.restrictions.disallowPublicOrgRegistration).toBe(true);
		expect(plan.homeOrg).toMatchObject({ role: "company", name: "Acme", loginPolicy: null });
	});

	test("public B2B & B2C: public org with sign-up, org sign-up as chosen", () => {
		const closed = InstanceTemplates.resolve("public-b2b-b2c", { homeOrgName: "Users" });
		const open = InstanceTemplates.resolve("public-b2b-b2c", {
			homeOrgName: "Users",
			allowOrgRegistration: true,
		});
		expect(closed.instance.restrictions.disallowPublicOrgRegistration).toBe(true);
		expect(open.instance.restrictions.disallowPublicOrgRegistration).toBe(false);
		expect(open.instance.domainPolicy.userLoginMustBeDomain).toBe(true);
		expect(open.instance.loginPolicy).toMatchObject({
			allowRegister: false,
			allowDomainDiscovery: true,
		});
		expect(open.homeOrg?.role).toBe("public");
		expect(open.homeOrg?.loginPolicy).toMatchObject({
			allowRegister: true,
			forceMfa: false,
			secondFactors: ["SECOND_FACTOR_TYPE_OTP", "SECOND_FACTOR_TYPE_U2F"],
		});
	});

	test("public B2C only never opens org sign-up and turns domain discovery off", () => {
		const plan = InstanceTemplates.resolve("public-b2c", {
			homeOrgName: "Users",
			allowOrgRegistration: true,
		});
		expect(plan.instance.restrictions.disallowPublicOrgRegistration).toBe(true);
		expect(plan.instance.loginPolicy.allowDomainDiscovery).toBe(false);
		expect(plan.instance.domainPolicy.userLoginMustBeDomain).toBe(true);
		expect(plan.homeOrg?.loginPolicy?.allowRegister).toBe(true);
	});

	test("public B2B only: the catch-all org inherits the closed instance defaults", () => {
		const plan = InstanceTemplates.resolve("public-b2b", {
			homeOrgName: "LeiCraft_MC",
			allowOrgRegistration: true,
		});
		expect(plan.homeOrg).toMatchObject({ role: "catch-all", loginPolicy: null });
		expect(plan.instance.loginPolicy.allowRegister).toBe(false);
		expect(plan.instance.restrictions.disallowPublicOrgRegistration).toBe(false);
	});

	test("minimal has no home org and needs no name", () => {
		const plan = InstanceTemplates.resolve("minimal", {});
		expect(plan.homeOrg).toBeNull();
		expect(plan.instance.domainPolicy.userLoginMustBeDomain).toBe(false);
	});

	test("templates with a home org need its name", () => {
		expect(() => InstanceTemplates.resolve("private", {})).toThrow();
		expect(() => InstanceTemplates.resolve("public-b2c", { homeOrgName: "  " })).toThrow();
	});

	test("the home org domain is normalized", () => {
		const plan = InstanceTemplates.resolve("public-b2c", {
			homeOrgName: "Users",
			homeOrgDomain: " Users.Example.COM ",
		});
		expect(plan.homeOrg?.domain).toBe("users.example.com");
	});

	test("the overview marks values chosen at creation", () => {
		const sections = InstanceTemplates.describe("public-b2b-b2c", null);
		const rows = sections.flatMap((section) => section.rows);
		expect(rows.every((row) => row.value.length > 0)).toBe(true);
		expect(rows.find((row) => row.label === "Public org")?.value).toBe("Chosen at creation");
		expect(rows.find((row) => row.label === "Org sign-up page")?.value).toContain(
			"Chosen at creation",
		);

		const chosen = InstanceTemplates.describe("public-b2b-b2c", {
			homeOrgName: "Users",
			allowOrgRegistration: true,
		}).flatMap((section) => section.rows);
		expect(chosen.find((row) => row.label === "Public org")?.value).toBe("Users");
		expect(chosen.find((row) => row.label === "Org sign-up page")?.value).toBe("Open");
	});
});

describe("Instance template routes", () => {
	test("list the templates for admins only", async () => {
		const admin = await seedSession("admin");
		const member = await seedSession("member");

		const data = await makeAPIRequest("/v1/instance-templates", {
			authToken: admin.token,
			expectedBodySchema: InstanceTemplatesModel.GetAll.Response,
		});
		expect(data.systemOrgName).toBe("SYSTEM");
		expect(data.templates.map((t) => t.id)).toEqual([...InstanceTemplates.IDS]);
		expect(data.templates.every((t) => t.sections.length > 0)).toBe(true);

		await makeAPIRequest("/v1/instance-templates", { authToken: member.token }, 403);
		await makeAPIRequest("/v1/instance-templates", {}, 401);
	});

	test("instance creation validates the template options", async () => {
		const admin = await seedSession("admin");
		const owner = {
			userName: "admin",
			email: { email: "admin@example.com" },
			profile: { firstName: "Ada", lastName: "Admin" },
			password: { password: "Correct-Horse-1" },
		};

		await makeAPIRequest(
			"/v1/instances",
			{ method: "POST", authToken: admin.token, body: { instanceName: "Acme", human: owner } },
			400,
		);
		await makeAPIRequest(
			"/v1/instances",
			{
				method: "POST",
				authToken: admin.token,
				body: { instanceName: "Acme", template: "private", human: owner },
			},
			400,
		);
		await makeAPIRequest(
			"/v1/instances",
			{
				method: "POST",
				authToken: admin.token,
				body: {
					instanceName: "Acme",
					template: "private",
					templateOptions: { homeOrgName: "system" },
					human: owner,
				},
			},
			400,
		);
		await makeAPIRequest(
			"/v1/instances",
			{
				method: "POST",
				authToken: admin.token,
				body: {
					instanceName: "Acme",
					template: "public-b2c",
					templateOptions: { homeOrgName: "Users", homeOrgDomain: "not a domain" },
					human: owner,
				},
			},
			400,
		);
	});
});

describe("Provisioning task", () => {
	const spies: { mockRestore(): void }[] = [];
	afterEach(() => {
		for (const spy of spies.splice(0)) spy.mockRestore();
	});

	const logger = { debug() {}, info() {}, warn() {}, error() {} };
	const notPaused = { getV: () => false, setV() {} } as never;

	/** Mock every Zitadel call the task makes; returns the ordered call log. */
	function mockZitadel(opts: { existingSystemLoginPolicy?: boolean } = {}) {
		const calls: { name: string; args: unknown[] }[] = [];
		const record =
			<T>(name: string, result?: (...args: any[]) => T) =>
			async (...args: any[]) => {
				calls.push({ name, args });
				return result?.(...args) as T;
			};
		const mock = (name: keyof typeof ZitadelClient, impl: (...args: any[]) => Promise<any>) => {
			spies.push(spyOn(ZitadelClient, name as never).mockImplementation(impl as never));
		};

		mock(
			"getInstance",
			record("getInstance", () => ({
				id: "inst-1",
				name: "Acme",
				state: "STATE_RUNNING",
				domains: [{ domain: "acme.auth.example.com", primary: true }],
			})),
		);
		mock(
			"findOrgByName",
			record("findOrgByName", (_host: string, name: string) =>
				name === "SYSTEM" ? { id: "sys-1", name } : null,
			),
		);
		mock(
			"addOrg",
			record("addOrg", () => "home-1"),
		);
		mock("addOrgLoginPolicy", async (...args: any[]) => {
			calls.push({ name: "addOrgLoginPolicy", args });
			if (opts.existingSystemLoginPolicy && args[1] === "sys-1") {
				throw new ZitadelApiError(409, "Errors.Org.LoginPolicy.AlreadyExists");
			}
		});
		mock("resetOrgDomainPolicy", async (...args: any[]) => {
			calls.push({ name: "resetOrgDomainPolicy", args });
			throw new ZitadelApiError(404, "Errors.Org.DomainPolicy.NotFound");
		});
		for (const name of [
			"updateOrgLoginPolicy",
			"addOrgDomainPolicy",
			"updateOrgDomainPolicy",
			"setOrgMetadata",
			"addOrgDomain",
			"setPrimaryOrgDomain",
			"setSecurityPolicy",
			"updateDefaultPasswordComplexityPolicy",
			"updateDefaultLockoutPolicy",
			"updateOIDCSettings",
			"setRestrictions",
			"updateDefaultLoginPolicy",
			"updateDefaultDomainPolicy",
			"setDefaultOrg",
		] as const) {
			mock(name, record(name));
		}

		const index = (name: string, orgId?: string) =>
			calls.findIndex((call) => call.name === name && (orgId === undefined || call.args[1] === orgId));
		/** The arguments of the first matching call (fails the test when there is none). */
		const argsOf = (name: string, orgId?: string) => {
			const call = calls[index(name, orgId)];
			if (!call) throw new Error(`${name} was not called${orgId ? ` for ${orgId}` : ""}`);
			return call.args;
		};
		return { calls, index, argsOf };
	}

	function seedSetup(
		instanceId: string,
		template: InstanceTemplates.Id,
		options: InstanceTemplates.Options,
	) {
		DB.instance()
			.insert(DB.Tables.instanceSetups)
			.values({ instance_id: instanceId, template, options, created_by_user_sub: "test" })
			.run();
	}

	async function run(instanceId: string) {
		return ProvisionInstanceTask(
			{ instanceId, actorSub: "test" },
			logger,
			{ data: {}, nextStepToExecute: 0 },
			notPaused,
		);
	}

	test("applies a public template in a safe order", async () => {
		seedSetup("inst-1", "public-b2b-b2c", {
			homeOrgName: "Users",
			homeOrgDomain: "users.example.com",
			allowOrgRegistration: true,
		});
		const { index, argsOf } = mockZitadel({ existingSystemLoginPolicy: true });

		const result = await run("inst-1");
		expect(result).toMatchObject({ success: true });

		// The SYSTEM org gets its own domain policy before the instance turns the suffix on.
		expect(index("addOrgDomainPolicy", "sys-1")).toBeGreaterThan(-1);
		expect(index("addOrgDomainPolicy", "sys-1")).toBeLessThan(index("updateDefaultDomainPolicy"));
		expect(argsOf("updateDefaultDomainPolicy")[1]).toMatchObject({ userLoginMustBeDomain: true });

		// An existing SYSTEM login policy is updated, without the factor fields.
		const update = argsOf("updateOrgLoginPolicy", "sys-1")[2];
		expect(update).toMatchObject({ allowRegister: false, forceMfa: true });
		expect(update).not.toHaveProperty("secondFactors");

		expect(argsOf("setRestrictions")[1]).toEqual({ disallowPublicOrgRegistration: false });

		// Home org: created, own login policy, verified domain, then the default org.
		expect(argsOf("addOrg")[1]).toBe("Users");
		expect(argsOf("addOrgLoginPolicy", "home-1")[2]).toMatchObject({ allowRegister: true });
		expect(argsOf("addOrgDomainPolicy", "home-1")[2]).toMatchObject({
			validateOrgDomains: false,
			userLoginMustBeDomain: true,
		});
		const domainFlow = [
			index("addOrgDomainPolicy", "home-1"),
			index("addOrgDomain", "home-1"),
			index("setPrimaryOrgDomain", "home-1"),
			index("resetOrgDomainPolicy", "home-1"),
			index("setDefaultOrg"),
		];
		expect(domainFlow.every((i) => i >= 0)).toBe(true);
		expect([...domainFlow].sort((a, b) => a - b)).toEqual(domainFlow);
		expect(argsOf("setDefaultOrg")[1]).toBe("home-1");

		const setup = DB.instance()
			.select()
			.from(DB.Tables.instanceSetups)
			.where(eq(DB.Tables.instanceSetups.instance_id, "inst-1"))
			.get();
		expect(setup).toMatchObject({ system_org_id: "sys-1", home_org_id: "home-1" });

		const audit = DB.instance()
			.select()
			.from(DB.Tables.auditLog)
			.where(
				and(
					eq(DB.Tables.auditLog.action, "instance.template.apply"),
					eq(DB.Tables.auditLog.target_instance_id, "inst-1"),
				),
			)
			.get();
		expect(audit?.detail).toBe("public-b2b-b2c");
	});

	test("a second run reuses the stored orgs", async () => {
		const { index, argsOf } = mockZitadel();

		const result = await run("inst-1");
		expect(result).toMatchObject({ success: true });
		expect(index("addOrg")).toBe(-1);
		expect(index("findOrgByName")).toBe(-1);
		expect(argsOf("setDefaultOrg")[1]).toBe("home-1");
	});

	test("minimal keeps the SYSTEM org as the default org", async () => {
		seedSetup("inst-2", "minimal", {});
		const { index } = mockZitadel();

		const result = await run("inst-2");
		expect(result).toMatchObject({ success: true });
		expect(index("addOrgLoginPolicy", "sys-1")).toBeGreaterThan(-1);
		expect(index("addOrg")).toBe(-1);
		expect(index("setDefaultOrg")).toBe(-1);
	});

	test("fails without a template row", async () => {
		mockZitadel();
		const result = await run("inst-unknown");
		expect(result).toMatchObject({ success: false });
	});
});
