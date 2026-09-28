import { Hono } from "hono";
import type { GenerateSpecOptions } from "hono-openapi";
import { AppConstants } from "../../../utils/constants";
import { APIVersionRouter } from "../../utils/apiVersionRouter";
import { authMiddlewareV1 } from "./middleware/auth";
import { router as authRouter } from "./routes/auth";
import { router as domainsRouter } from "./routes/domains";
import { router as healthRouter } from "./routes/health";
import { router as instancesRouter } from "./routes/instances";

const openAPIConfig: Partial<GenerateSpecOptions> = {
	documentation: {
		info: {
			title: `${AppConstants.APP_NAME} API`,
			version: "1.0.0",
			description: `API for ${AppConstants.APP_NAME} Frontend and third-party clients`,
		},
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
					description: "Enter your bearer token in the format **Bearer <token>**",
				},
			},
			responses: {
				401: {
					description: "Authentication information is missing or invalid",
				},
			},
		},

		security: [
			{
				bearerAuth: [],
			},
		],

		servers: [
			{
				url: `http://localhost:${AppConstants.APP_API_DEFAULT_PORT}/api/v1`,
				description: "Local development server",
			},
			{
				url: `${AppConstants.APP_API_DEFAULT_PROD_URL}/api/v1`,
				description: "Production server",
			},
		],

		"x-tagGroups": [
			{
				name: "System",
				tags: ["System"],
			},
			{
				name: "Authentication",
				tags: ["Authentication"],
			},
			{
				name: "Instances",
				tags: ["Instances", "Domains", "Limits"],
			},
		],

		tags: [
			{
				name: "System",
				description: "Service health and metadata.",
			},
			{
				name: "Authentication",
				description:
					"Zitadel OIDC login/logout, the env-based static fallback login, and the current-user endpoint.",
			},
			{
				name: "Instances",
				description: "Virtual instance CRUD over the Zitadel System API.",
			},
			{
				name: "Domains",
				// @ts-expect-error
				"x-displayName": "Domains",
				summary: "Domains",
				parent: "Instances",
				description: "Cross-instance and per-instance custom domain management.",
			},
			{
				name: "Limits",
				// @ts-expect-error
				"x-displayName": "Limits",
				summary: "Limits",
				parent: "Instances",
				description: "Per-instance limits and quota.",
			},
		],
	},
};

const router = new Hono();

router.use(authMiddlewareV1);

router.route("/", healthRouter);
router.route("/", authRouter);
router.route("/", instancesRouter);
router.route("/", domainsRouter);

export class APIv1Router extends APIVersionRouter {
	constructor() {
		super({
			version: 1,
			openAPIConfig,
			routes: router,
		});
	}
}
