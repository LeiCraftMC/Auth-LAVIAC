import { Hono } from "hono";
import type { GenerateSpecOptions } from "hono-openapi";
import { AppConstants } from "../../../utils/constants";
import { APIVersionRouter } from "../../utils/apiVersionRouter";
import { authMiddlewareV1 } from "./middleware/auth";
import { router as adminRouter } from "./routes/admin";
import { router as authRouter } from "./routes/auth";
import { router as domainsRouter } from "./routes/domains";
import { router as instanceTemplatesRouter } from "./routes/instance-templates";
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
					description: "Enter your bearer token in the format **Bearer &lt;token&gt;**",
				},
			},
			responses: {
				401: {
					description: "Authentication information is missing or invalid",
				},
			},
		},

		// Disable global security because Scalar could not handle multiple security schemes properly
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
				name: "Authentication",
				tags: ["Authentication"],
			},
			{
				name: "Instances",
				tags: [
					"Instances",
					"Instances / Domains",
					"Instances / Limits",
					"Instances / Branding",
					"Instances / Template",
					"Instance Templates",
					"Domains",
				],
			},
			{
				name: "Admin",
				tags: [
					"Admin / Statistics",
					"Admin / Host",
					"Admin / Updates",
					"Admin / Audit Log",
					"Admin / Tasks",
					"Admin / Sessions",
				],
			},
		],

		tags: [
			{
				name: "Authentication",
				description:
					"Zitadel OIDC login/logout, the env-based static fallback login, and the current-user endpoint",
			},

			{
				name: "Instances",
				description: "Virtual instance CRUD over the Zitadel System API",
			},
			{
				name: "Instances / Domains",
				// @ts-ignore
				"x-displayName": "Domains",
				summary: "Domains",
				parent: "Instances",
				description: "Per-instance custom domain management",
			},
			{
				name: "Instances / Limits",
				// @ts-ignore
				"x-displayName": "Limits",
				summary: "Limits",
				parent: "Instances",
				description: "Per-instance limits and quota",
			},
			{
				name: "Instances / Branding",
				// @ts-ignore
				"x-displayName": "Branding",
				summary: "Branding",
				parent: "Instances",
				description: "Per-instance label policy and the LAVIAC default branding",
			},
			{
				name: "Instances / Template",
				// @ts-ignore
				"x-displayName": "Template",
				summary: "Template",
				parent: "Instances",
				description: "The template an instance was created with and its provisioning",
			},
			{
				name: "Instance Templates",
				description: "The instance templates and the settings each one applies",
			},
			{
				name: "Domains",
				description: "Cross-instance domain checks",
			},

			{
				name: "Admin / Statistics",
				// @ts-ignore
				"x-displayName": "Statistics",
				summary: "Statistics",
				parent: "Admin",
				description: "Cross-instance statistics and usage",
			},
			{
				name: "Admin / Host",
				// @ts-ignore
				"x-displayName": "Host",
				summary: "Host",
				parent: "Admin",
				description: "Status and metrics of the host VM",
			},
			{
				name: "Admin / Updates",
				// @ts-ignore
				"x-displayName": "Updates",
				summary: "Updates",
				parent: "Admin",
				description: "OS package updates of the host VM and Zitadel releases",
			},
			{
				name: "Admin / Audit Log",
				// @ts-ignore
				"x-displayName": "Audit Log",
				summary: "Audit Log",
				parent: "Admin",
				description: "The LAVIAC audit log",
			},
			{
				name: "Admin / Tasks",
				// @ts-ignore
				"x-displayName": "Tasks",
				summary: "Tasks",
				parent: "Admin",
				description: "Background tasks and their logs",
			},
			{
				name: "Admin / Sessions",
				// @ts-ignore
				"x-displayName": "Sessions",
				summary: "Sessions",
				parent: "Admin",
				description: "Active LAVIAC sessions",
			},
		],
	},
};

const router = new Hono();

router.use(authMiddlewareV1);

router.route("/", authRouter);
router.route("/", instancesRouter);
router.route("/", instanceTemplatesRouter);
router.route("/", domainsRouter);
router.route("/", adminRouter);

export class APIv1Router extends APIVersionRouter {
	constructor() {
		super({
			version: 1,
			openAPIConfig,
			routes: router,
		});
	}
}
