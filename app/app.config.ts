/**
 * app.config.ts — NuxtUI theme. LAVIAC uses `sky` (auth/console identity) on `slate`.
 * See Style-Guides docs/15-design-system.md.
 */
export default defineAppConfig({
	ui: {
		colors: {
			primary: "sky",
			neutral: "slate",
		},
	},
	theme: {
		radius: 0.5,
		blackAsPrimary: false,
	},
});
