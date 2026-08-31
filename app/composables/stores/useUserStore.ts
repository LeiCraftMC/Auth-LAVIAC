import { BasicAbstractStore } from "~/utils/abstractStore";

export interface AdminUser {
	sub: string;
	email: string | null;
	name: string | null;
	isAdmin: boolean;
}

class UserStore extends BasicAbstractStore<AdminUser> {
	constructor() {
		super("laviac-user", { enableAutoFetchIfEmpty: true });
	}

	protected async fetchData() {
		// No session cookie → no point hitting /auth/me (it would 401 and trigger a redirect).
		if (!useAppCookies().sessionToken.get().value) return null;
		const result = await useAPI((api) => api.getAuthMe({}), true);
		return result.success ? (result.data as AdminUser) : null;
	}
}

export function useUserStore() {
	return new UserStore();
}
