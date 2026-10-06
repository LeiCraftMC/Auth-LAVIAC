import { BasicAbstractStore } from "~/utils/abstractStore";
import type { UserInfo } from "~/utils/types";

// Read-only: LAVIAC admins are managed in Zitadel, so there is no `PUT /account` to mirror.
class UserInfoStore extends BasicAbstractStore<UserInfo> {
	constructor() {
		super("userInfo", {
			enableAutoFetchIfEmpty: true,
		});
	}

	protected override async fetchData() {
		if (!useAppCookies().sessionToken.get().value) {
			return null;
		}

		// `true` = no auth redirect; auth.global.ts decides where to send the user.
		const response = await useAPI((api) => api.getAuthSession({}), true);
		if (!response.success) {
			return null;
		}

		return response.data satisfies UserInfo;
	}
}

export function useUserInfoStore() {
	return new UserInfoStore();
}
