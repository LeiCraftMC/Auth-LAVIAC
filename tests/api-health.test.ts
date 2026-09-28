import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { API } from "../server/lib/api";
import { makeAPIRequest } from "./helpers/api";

describe("health", () => {
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
