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
		preset: "bun",
		// Keep the native SQLite binding out of the bundle.
		rollupConfig: { external: ["bun:sqlite"] },
	},
	runtimeConfig: {
		public: {
			appUrl: process.env.LAVIAC_APP_URL || "http://localhost:12400",
		},
	},
	routeRules: {
		"/instances/**": { ssr: false },
		"/auth/**": { ssr: false },
		"/**": { ssr: true },
	},

	telemetry: false
});
