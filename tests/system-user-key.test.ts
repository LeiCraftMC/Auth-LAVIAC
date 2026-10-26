import { describe, expect, it } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { importPKCS8 } from "jose";
import { ConfigHandler, type ParsedConfig } from "../server/lib/utils/config";
import { ZitadelSystemJwt } from "../server/lib/zitadel/jwt";

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

describe("system-user JWT", () => {
	it("is signed for the configured audience instead of the API URL", async () => {
		const config = ConfigHandler.getConfig() as ParsedConfig;
		const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
		writeFileSync(
			`${config.CONFIG_BASE_DIR}/system-user.pem`,
			privateKey.export({ type: "pkcs1", format: "pem" }),
		);
		const saved = { ...config };
		Object.assign(config, {
			ZITADEL_SYSTEM_USER_ID: "test-system-user",
			ZITADEL_SYSTEM_API_URL: "https://auth.example.com",
			ZITADEL_SYSTEM_API_AUDIENCE: "https://zitadel.example.com/",
		});
		try {
			const jwt = await ZitadelSystemJwt.get();
			const payload = JSON.parse(Buffer.from(jwt.split(".")[1] as string, "base64url").toString());
			expect(payload).toMatchObject({
				iss: "test-system-user",
				sub: "test-system-user",
				aud: "https://zitadel.example.com",
			});
		} finally {
			Object.assign(config, saved);
			// The JWT and key are cached; other tests run without a system user.
			Reflect.set(ZitadelSystemJwt, "cachedJwt", null);
			Reflect.set(ZitadelSystemJwt, "cachedKey", null);
			Reflect.set(ZitadelSystemJwt, "cachedExp", 0);
		}
	});
});
