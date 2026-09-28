/**
 * AppConstants — project-wide identifiers (Style-Guides templates/fullstack-nuxt-app,
 * server/lib/utils/constants.ts). The token/env prefixes live here so they cannot drift.
 * See docs/03-naming-and-typescript.md.
 */
export namespace AppConstants {
	export const APP_NAME = "LAVIAC";
	/** Environment-variable prefix — `ConfigHandler` reads `<prefix>_<KEY>`. */
	export const APP_ENV_PREFIX = "LAVIAC";
	/** Bearer-token and cookie prefix: `<prefix>_sess_<id>:<base>`, `<prefix>_session_token`. */
	export const APP_KEYS_PREFIX = "laviac";
	/** Dev/prod port (12xxx range, docs/02-tooling.md — never 3000). */
	export const APP_API_DEFAULT_PORT = 12191;
	export const APP_API_DEFAULT_PROD_URL = `https://laviac.is-on.net`;
}
