// LAVIAC — full-stack Nuxt app (Hono backend mounted in Nitro `server/`).
// See Style-Guides docs/01 (Full-stack Nuxt app) and docs/04 (Mounting Hono in Nitro).
export default defineNuxtConfig({
	future: { compatibilityVersion: 4 },
	srcDir: "app/",
	ssr: false, // internal admin dashboard — no SEO, avoids SSR auth/cookie complexity
	modules: ["@nuxt/ui"],
	css: ["~/assets/css/main.css"],
	ui: { colorMode: true },
	compatibilityDate: "2026-08-27",
	nitro: {
		preset: "bun",
		rollupConfig: {
			external: ["bun:sqlite"],
		},
	},
	runtimeConfig: {
		public: {
			apiUrl: process.env.NUXT_PUBLIC_API_URL || "http://localhost:3000",
			appUrl: process.env.NUXT_PUBLIC_APP_URL || "http://localhost:3000",
		},
	},
});
