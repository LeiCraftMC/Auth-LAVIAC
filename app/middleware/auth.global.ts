import { useUserStore } from "~/composables/stores/useUserStore";
import { SimpleRouteMatcher } from "~/utils/routeMatcher";

const PUBLIC_ROUTES = ["/auth/login"];

export default defineNuxtRouteMiddleware(async (to) => {
	const match = SimpleRouteMatcher.match(to.path, PUBLIC_ROUTES);
	if (match) return;

	// Resolve the current session through the shared user store so the middleware and the
	// app header share a single fetch. fetchData uses disableAuthRedirect; we control the
	// redirect here so the `url` query carries the original destination.
	const user = await useUserStore().use();
	if (!user) {
		return navigateTo(`/auth/login?url=${encodeURIComponent(to.fullPath)}`);
	}
});