import { describe, expect, test } from "bun:test";
import { ZitadelAPIUtils } from "../server/lib/api/utils/zitadel";
import { ZitadelBranding } from "../server/lib/zitadel/branding";
import { ZitadelClient } from "../server/lib/zitadel/client";
import { ZitadelReleases } from "../server/lib/zitadel/releases";

describe("Zitadel → API mappers", () => {
	test("maps a Zitadel instance to the LAVIAC shape", () => {
		const mapped = ZitadelAPIUtils.mapInstance({
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

	test("maps a domain", () => {
		expect(ZitadelAPIUtils.mapDomain({ domain: "x.com", primary: false, generated: true })).toEqual({
			domain: "x.com",
			primary: false,
			generated: true,
		});
	});

	test("addresses an instance by its primary domain, else its first one", () => {
		const base = { id: "1", name: "A", state: "STATE_RUNNING" as const };
		expect(
			ZitadelClient.getInstanceHost({
				...base,
				domains: [
					{ domain: "gen.example.com", generated: true },
					{ domain: "a.com", primary: true },
				],
			}),
		).toBe("a.com");
		expect(ZitadelClient.getInstanceHost({ ...base, domains: [{ domain: "gen.example.com" }] })).toBe(
			"gen.example.com",
		);
		expect(ZitadelClient.getInstanceHost({ ...base, domains: [] })).toBeNull();
	});
});

describe("Zitadel releases", () => {
	test("compares versions numerically", () => {
		expect(ZitadelReleases.compareVersions("v2.9.0", "v2.10.0")).toBeLessThan(0);
		expect(ZitadelReleases.compareVersions("v4.1.0", "4.1.0")).toBe(0);
		expect(ZitadelReleases.compareVersions("v4.2.0-rc.1", "v4.1.9")).toBeGreaterThan(0);
		expect(ZitadelReleases.compareVersions("v3", "v3.0.1")).toBeLessThan(0);
	});
});

describe("Default branding", () => {
	test("matches the LeiCraft_MC branding and is dark-only without watermark", () => {
		const policy = ZitadelBranding.DEFAULT_LABEL_POLICY;

		expect(policy.backgroundColor).toBe("#020719");
		expect(policy.primaryColor).toBe("#0392CA");
		expect(policy.warnColor).toBe("#FF6467");
		expect(policy.fontColor).toBe("#FFFFFF");
		expect(policy.backgroundColorDark).toBe(policy.backgroundColor);
		expect(policy.primaryColorDark).toBe(policy.primaryColor);
		expect(policy.warnColorDark).toBe(policy.warnColor);
		expect(policy.fontColorDark).toBe(policy.fontColor);
		expect(policy.themeMode).toBe("THEME_MODE_DARK");
		expect(policy.disableWatermark).toBe(true);
	});

	test("ships the font as a Nitro server asset", async () => {
		const font = Bun.file(`server/assets/${ZitadelBranding.FONT.assetKey}`);
		expect(await font.exists()).toBe(true);
		// woff2 signature
		expect(new TextDecoder().decode((await font.bytes()).slice(0, 4))).toBe("wOF2");
	});
});
