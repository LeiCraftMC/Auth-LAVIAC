import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { RuntimeMetadata } from "../server/lib/api/utils/metadata";
import { AdminAuditModel } from "../server/lib/api/versions/v1/routes/admin/audit/model";
import { DB } from "../server/lib/db";
import { TaskScheduler } from "../server/lib/tasks";
import { Audit } from "../server/lib/utils/audit";
import { makeAPIRequest } from "./helpers/api";
import { seedSession } from "./helpers/seed";

describe("Runtime metadata", () => {
	test("concurrent first reads create the row once", async () => {
		const [a, b] = await Promise.all([
			RuntimeMetadata.getZitadelRelease(),
			RuntimeMetadata.getZitadelRelease(),
		]);
		expect(a).toEqual(b);
		expect(a.checkedAt).toBeNull();
	});

	test("writes upsert without a prior read", async () => {
		const status = {
			supported: true,
			reason: null,
			checkedAt: 1,
			listsUpdatedAt: 2,
			rebootRequired: true,
			rebootPackages: ["linux-image-amd64"],
			packages: [],
			error: null,
		};
		await RuntimeMetadata.setOSUpdates(status);
		expect(await RuntimeMetadata.getOSUpdates()).toEqual(status);

		await RuntimeMetadata.setOSUpdates({ ...status, checkedAt: 3 });
		expect((await RuntimeMetadata.getOSUpdates()).checkedAt).toBe(3);
	});
});

describe("Task scheduler", () => {
	test("fails a stored task whose function is no longer registered", async () => {
		const task = DB.instance()
			.insert(DB.Tables.scheduled_tasks)
			.values({
				function: "removedTask",
				created_by_user_sub: null,
				args: {},
				status: "pending",
				created_at: Date.now(),
			})
			.returning()
			.get();

		await TaskScheduler.processQueue();

		const stored = DB.instance()
			.select()
			.from(DB.Tables.scheduled_tasks)
			.where(eq(DB.Tables.scheduled_tasks.id, task.id))
			.get();
		expect(stored?.status).toBe("failed");
		expect(stored?.message).toContain("removedTask");
		expect(stored?.finished_at).not.toBeNull();
	});
});

describe("Audit log search", () => {
	test("treats % and _ literally", async () => {
		const admin = await seedSession("admin");
		await Audit.log("search-test", "test.a_b");
		await Audit.log("search-test", "test.axb");

		const underscore = await makeAPIRequest("/v1/admin/audit?searchString=a_b", {
			authToken: admin.token,
			expectedBodySchema: AdminAuditModel.GetAll.Response,
		});
		expect(underscore.items.map((entry) => entry.action)).toEqual(["test.a_b"]);

		const percent = await makeAPIRequest("/v1/admin/audit?searchString=%25%25%25", {
			authToken: admin.token,
			expectedBodySchema: AdminAuditModel.GetAll.Response,
		});
		expect(percent.total).toBe(0);
	});
});
