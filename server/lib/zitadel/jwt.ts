/**
 * System-user JWT — the ONLY way to authenticate against the Zitadel System API
 * (self-hosted only). A self-signed RS256 JWT (iss/sub = system user id, aud = Zitadel
 * URL, exp = now + 1h) is sent directly as `Authorization: Bearer <jwt>` — it is NOT
 * exchanged at the OAuth token endpoint.
 *
 * The system user and its public key are registered in Zitadel runtime settings
 * (`SystemAPIUsers`). See:
 * https://zitadel.com/docs/guides/integrate/zitadel-apis/access-zitadel-system-api
 */
import { importPKCS8, SignJWT } from "jose";
import { ConfigHandler } from "../utils/config";
import { Logger } from "../utils/logger";

const LIFETIME_SECONDS = 60 * 60; // 1 hour — Zitadel rejects exp further than 1h after iat.
const REFRESH_MARGIN_SECONDS = 5 * 60; // re-mint 5 min before expiry.

export class ZitadelSystemJwt {
	private static cachedKey: CryptoKey | null = null;
	private static cachedJwt: string | null = null;
	private static cachedExp = 0;

	private static async getKey(): Promise<CryptoKey> {
		if (ZitadelSystemJwt.cachedKey) return ZitadelSystemJwt.cachedKey;
		const pem = ConfigHandler.resolveSystemUserPrivateKey();
		ZitadelSystemJwt.cachedKey = await importPKCS8(pem, "RS256");
		return ZitadelSystemJwt.cachedKey;
	}

	/** Mint (or return a cached) system-user JWT for the System API. */
	static async get(): Promise<string> {
		const nowSeconds = Math.floor(Date.now() / 1000);

		if (
			ZitadelSystemJwt.cachedJwt &&
			ZitadelSystemJwt.cachedExp - nowSeconds > REFRESH_MARGIN_SECONDS
		) {
			return ZitadelSystemJwt.cachedJwt;
		}

		const config = ConfigHandler.getConfig();
		const userId = config?.ZITADEL_SYSTEM_USER_ID;
		const audience = (config?.ZITADEL_SYSTEM_API_URL ?? "").replace(/\/$/, "");
		if (!userId || !audience) {
			throw new Error("LAVIAC_ZITADEL_SYSTEM_USER_ID and LAVIAC_ZITADEL_SYSTEM_API_URL must be set.");
		}

		const key = await ZitadelSystemJwt.getKey();
		const iat = nowSeconds;
		const exp = nowSeconds + LIFETIME_SECONDS;

		ZitadelSystemJwt.cachedJwt = await new SignJWT({})
			.setProtectedHeader({ alg: "RS256" })
			.setIssuer(userId)
			.setSubject(userId)
			.setAudience(audience)
			.setIssuedAt(iat)
			.setExpirationTime(exp)
			.sign(key);
		ZitadelSystemJwt.cachedExp = exp;
		Logger.debug("Minted new Zitadel system-user JWT.");
		return ZitadelSystemJwt.cachedJwt;
	}
}
