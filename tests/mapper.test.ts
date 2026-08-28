import { describe, expect, it } from "bun:test";
import { mapDomain, mapInstance } from "../server/lib/api/versions/v1/routes/instances/mapper";

describe("instance mapper", () => {
	it("maps a Zitadel instance to the LAVIAC shape", () => {
		const mapped = mapInstance({
			id: "123",
			state: "STATE_RUNNING",
			name: "Acme",
			version: "2.50.0",
			details: { creationDate: "2026-01-01T00:00:00Z", changeDate: "2026-01-02T00:00:00Z" },
			domains: [
				{ domain: "acme.com", primary: true },
				{ domain: "zitadel-abc.acme.com", generated: true },
			],
		});

		expect(mapped.id).toBe("123");
		expect(mapped.name).toBe("Acme");
		expect(mapped.state).toBe("STATE_RUNNING");
		expect(mapped.version).toBe("2.50.0");
		expect(mapped.createdAt).toBe("2026-01-01T00:00:00Z");
		expect(mapped.changedAt).toBe("2026-01-02T00:00:00Z");
		expect(mapped.domains).toHaveLength(2);
		expect(mapped.domains?.[0]).toEqual({
			domain: "acme.com",
			primary: true,
			generated: undefined,
		});
	});

	it("maps a domain", () => {
		expect(mapDomain({ domain: "x.com", primary: false, generated: true })).toEqual({
			domain: "x.com",
			primary: false,
			generated: true,
		});
	});
});
