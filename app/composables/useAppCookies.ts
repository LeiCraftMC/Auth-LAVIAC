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
	return {
		sessionToken: new AppCookie<string | null>("laviac_session_token"),
	} as const;
}
