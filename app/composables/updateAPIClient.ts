/**
 * updateAPIClient — point the generated SDK at the API and attach the bearer token.
 *
 * The generated client is `@hey-api/client-fetch` (not the default `@hey-api/client-nuxt`
 * because the Nuxt client produces type errors under Windows/Bun/vue-tsc 3.3 — see
 * `openapi-ts.config.ts`). The client returns `{ data?, error?, request?, response? }`;
 * `useAPI` unwraps the envelope from `data ?? error`. `throwOnError: false` ensures non-2xx
 * responses are returned instead of thrown.
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
