/**
 * AppConstants — project-wide identifiers (Style-Guides templates/fullstack-nuxt-app,
 * server/lib/utils/constants.ts). The env prefix and the token/cookie prefix live here so
 * they cannot drift. See docs/03-naming-and-typescript.md.
 */
export namespace AppConstants {
	export const APP_NAME = "LAVIAC";

	/** Environment-variable prefix (`LAVIAC_*`). */
	export const APP_ENV_PREFIX = "LAVIAC";

	/** Bearer-token and cookie prefix: `<prefix>_sess_<id>:<base>`, `<prefix>_session_token`. */
	export const APP_KEYS_PREFIX = "laviac";

	/** Dev/prod port — unique per app in the 12xxx range, never 3000 (docs/02-tooling.md). */
	export const APP_API_DEFAULT_PORT = 12191;
}
