/**
 * useRuntimeAppConfigs — typed access to publicRuntimeConfig.
 * Copied from Style-Guides shared/frontend/useRuntimeAppConfigs.ts. See docs/05-api-contract.md.
 */
export function useRuntimeAppConfigs() {
	const config = useRuntimeConfig();
	return {
		apiUrl: (config.public.apiUrl as string | undefined) ?? "",
		appUrl: (config.public.appUrl as string | undefined) ?? "",
	} as const;
}
