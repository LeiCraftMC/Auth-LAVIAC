/**
 * useAppCookies — typed session-cookie accessor.
 * Copied from Style-Guides shared/frontend/useAppCookies.ts; prefix set to `laviac_`.
 * See docs/07-state-and-data.md and docs/10-auth.md.
 */
import type { CookieOptions } from "#app";

type CookieOptionsWithoutReadonly<T> = CookieOptions<T> & {
	readonly?: false;
};

class AppCookie<T extends string | null | undefined> {
	constructor(
		protected readonly name: string,
		protected readonly options?: CookieOptionsWithoutReadonly<T>,
	) {}

	get() {
		return useCookie(this.name);
	}

	set(value: T) {
		useCookie(this.name, this.options as CookieOptionsWithoutReadonly<T> | undefined).value = value;
	}
}

export function useAppCookies() {
	// docs/10-auth.md: `httpOnly: false` — the client must read the token to attach it as
	// `Authorization: Bearer` via updateAPIClient. LAVIAC sets `secure` dynamically (from
	// LAVIAC_APP_URL) so the cookie also works on plain-http local development — recorded
	// as a divergence in AGENTS.md.
	const sessionCookieOptions: CookieOptionsWithoutReadonly<string | null> = {
		path: "/",
		sameSite: "lax",
		httpOnly: false,
		secure: useRuntimeAppConfigs().appUrl.startsWith("https://"),
	};
	return {
		sessionToken: new AppCookie<string | null>("laviac_session_token", sessionCookieOptions),
	} as const;
}
