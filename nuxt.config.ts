// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: "2026-09-01",
	devtools: { enabled: true },
	modules: ["@nuxt/ui"],

	colorMode: {
		preference: "dark",
		fallback: "dark",
		classSuffix: "",
	},

	ssr: true,

	css: ["~/assets/css/main.css"],

	nitro: {
		rollupConfig: { external: ["bun:sqlite"] },

		// server/ runs on Bun (bun:sqlite, Bun.password, …).
		typescript: {
			tsConfig: { compilerOptions: { types: ["bun-types"] } },
		},

		esbuild: {
			options: {
				target: "esnext",
			},
		},

		rollupConfig: {
			output: {
				banner: (function () {
					
					const mappings = {
						LAVIAC_APP_URL: "APP_URL"
					};

					const bannerCode = `
						(function () {
							const mappings = ${JSON.stringify(mappings)};
							const env = globalThis.process?.env ?? {};
							for (const [envName, runtimeName] of Object.entries(mappings)) {
								if (!env['NUXT_PUBLIC_' + runtimeName] && env[envName]) {
									env['NUXT_PUBLIC_' + runtimeName] = env[envName];
								}
							}
						})();
					`;

					return bannerCode.replace(/^\s+|\s+$/g, '').replace(/\n\s*/g, ' ');
				})()
			}
		},
	},

	runtimeConfig: {
		public: {
			appUrl: process.env.LAVIAC_APP_URL || "http://localhost:12191",
		},
	},

	// docs/06-frontend-nuxt.md: client-only for the guarded dashboard/auth pages,
	// SSR for everything else. LAVIAC's only public page is the `/` redirect.
	routeRules: {
		"/instances/**": { ssr: false },
		"/auth/**": { ssr: false },
		"/**": { ssr: true },
	},

	telemetry: false,
});
