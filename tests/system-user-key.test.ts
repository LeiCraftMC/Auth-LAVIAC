import { describe, expect, it } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { importPKCS8 } from "jose";
import { ConfigHandler } from "../server/lib/utils/config";

describe("system-user private key normalization", () => {
	it("converts a PKCS#1 (BEGIN RSA PRIVATE KEY) PEM to PKCS#8 that jose accepts", async () => {
		const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
		const pkcs1 = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
		expect(pkcs1).toContain("BEGIN RSA PRIVATE KEY");

		const normalized = ConfigHandler.normalizePrivateKeyPem(pkcs1);
		expect(normalized).toContain("BEGIN PRIVATE KEY");

		// jose rejects the raw PKCS#1 PEM but accepts the normalized key.
		await expect(importPKCS8(pkcs1, "RS256")).rejects.toThrow();
		await importPKCS8(normalized, "RS256");
	});

	it("passes a PKCS#8 PEM through unchanged", () => {
		const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
		const pkcs8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
		expect(ConfigHandler.normalizePrivateKeyPem(pkcs8)).toBe(pkcs8);
	});
});
