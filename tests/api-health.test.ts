import { beforeAll, describe, expect, it } from "bun:test";
import { z } from "zod";
import { DB } from "../server/db";
import { API } from "../server/lib/api";
import { ConfigHandler } from "../server/utils/config";
import { makeAPIRequest } from "./helpers/make-api-request";

describe("health", () => {
	beforeAll(async () => {
		process.env.LAVIAC_DB_PATH = ":memory:";
		process.env.LAVIAC_DB_AUTO_MIGRATE = "false";
		await ConfigHandler.loadConfig();
		DB.init(":memory:", false);
		await API.init(true); // disable docs for the test
	});

	it("GET /v1 returns a healthy envelope", async () => {
		const res = await makeAPIRequest<{ status: string; uptime: number }>(API.getApp(), "/v1", {
			method: "GET",
			expectedBodySchema: z.object({ status: z.literal("ok"), uptime: z.number() }),
		});
		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.code).toBe(200);
		expect(res.data.status).toBe("ok");
	});

	it("GET /health returns healthy", async () => {
		const res = await makeAPIRequest(API.getApp(), "/health", { method: "GET" });
		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
	});
});
