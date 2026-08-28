/**
 * updateAPIClient — point the generated SDK at the API and attach the bearer token.
 *
 * `throwOnError: false` means the client never throws on non-2xx; the
 * `{ success, code, message, data }` envelope is always returned (in `result.data` on
 * success, `result.error` on failure) and `useAPI` unwraps it. See docs/05-api-contract.md.
 */
import { client } from "@/api-client/client.gen";
import { useRuntimeAppConfigs } from "./useRuntimeAppConfigs";

export function updateAPIClient(token: string | null) {
	const appUrl = useRuntimeAppConfigs().appUrl.replace(/\/$/, "");
	const apiURL = `${appUrl}/api/v1`;

	if (token) {
		client.setConfig({
			baseUrl: apiURL,
			headers: {
				Authorization: `Bearer ${token}`,
			},
			throwOnError: false,
		});
	} else {
		client.setConfig({
			baseUrl: apiURL,
			throwOnError: false,
		});
	}
}
