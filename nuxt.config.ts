// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: "2026-08-20",
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
	},
	runtimeConfig: {
		public: {
			appUrl: process.env.LAVIAC_APP_URL || "http://localhost:12191",
		},
	},
	routeRules: {
		"/**": { ssr: false },
	},

	telemetry: false,
});
