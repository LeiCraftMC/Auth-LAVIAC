/**
 * auth.global.ts — session-aware route guard.
 *
 * - `/auth/*` is for signed-out users; a valid session is sent on to `HOME_ROUTE`.
 * - `PROTECTED_PREFIXES` need a valid session, otherwise → `/auth/login?url=…`.
 * - `ADMIN_PREFIXES` additionally need `role === "admin"`, otherwise → `HOME_ROUTE`.
 * - `PUBLIC_ROUTES` are exceptions inside a protected prefix (`[param]` segments supported).
 * - Everything else (landing page, marketing pages) is public.
 *
 * LAVIAC is a login-only app without a public landing page: `PROTECTED_PREFIXES = ["/"]`,
 * `HOME_ROUTE = "/instances"` (see docs/10-auth.md).
 */
import { useUserInfoStore } from "~/composables/stores/useUserStore";

const HOME_ROUTE = "/instances";
const PROTECTED_PREFIXES = ["/"];
const ADMIN_PREFIXES: string[] = [];
const PUBLIC_ROUTES: string[] = [];

function hasPrefix(path: string, prefixes: string[]) {
	return prefixes.some(
		(prefix) => prefix === "/" || path === prefix || path.startsWith(`${prefix}/`),
	);
}

export default defineNuxtRouteMiddleware(async (to) => {
	const sessionToken = useAppCookies().sessionToken;
	const token = sessionToken.get().value;
	const store = useUserInfoStore();

	if (hasPrefix(to.path, ["/auth"])) {
		if (!token) return;
		if (store.isValid(await store.use())) return navigateTo(HOME_ROUTE);

		// Token exists but is invalid or expired: clear it and stay on the auth page.
		sessionToken.set(null);
		return;
	}

	if (!hasPrefix(to.path, PROTECTED_PREFIXES)) return;
	if (SimpleRouteMatcher.match(to.path, PUBLIC_ROUTES)) return;

	const loginRoute = `/auth/login?url=${encodeURIComponent(to.fullPath)}`;
	if (!token) return navigateTo(loginRoute);

	const user = await store.use();
	if (!store.isValid(user)) {
		sessionToken.set(null);
		return navigateTo(loginRoute);
	}

	if (hasPrefix(to.path, ADMIN_PREFIXES) && user.value.role !== "admin") {
		return navigateTo(HOME_ROUTE);
	}
});
