/**
 * useUserInfoStore — the signed-in admin (`GET /auth/me`), cached in `useState`.
 *
 * Auto-fetches on the first `use()` and resolves to `null` without a valid session. `useAPI`
 * runs with the auth redirect disabled so `auth.global.ts` decides where to send the user.
 * Call `clear()` on logout. See docs/07-state-and-data.md.
 */
import { BasicAbstractStore } from "~/utils/abstractStore";
import type { UserInfo } from "~/utils/types";

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

		const response = await useAPI((api) => api.getAuthMe({}), true);
		if (!response.success) {
			return null;
		}

		// The client-fetch envelope payload type is wider than UserInfo (see useAPI's
		// EnvelopeData); the backend model (AuthModel.Me.Response) guarantees the shape.
		return response.data as UserInfo;
	}
}

export function useUserInfoStore() {
	return new UserInfoStore();
}
