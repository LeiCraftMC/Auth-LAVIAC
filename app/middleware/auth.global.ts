import { SimpleRouteMatcher } from "~/utils/routeMatcher";

const PUBLIC_ROUTES = ["/auth/login"];

export default defineNuxtRouteMiddleware(async (to) => {
	const match = SimpleRouteMatcher.match(to.path, PUBLIC_ROUTES);
	if (match) return;

	// Resolve the current session. disableAuthRedirect so useAPI does not navigate itself;
	// we control the redirect here so the `url` query carries the original destination.
	const result = await useAPI((api) => api.getAuthMe(), true);
	if (!result.success) {
		return navigateTo(`/auth/login?url=${encodeURIComponent(to.fullPath)}`);
	}
});
