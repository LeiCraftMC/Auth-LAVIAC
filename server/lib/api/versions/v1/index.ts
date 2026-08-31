import { Hono } from "hono";
import type { GenerateSpecOptions } from "hono-openapi";
import { APIVersionRouter } from "../../utils/apiVersionRouter";
import { authMiddlewareV1 } from "./middleware/auth";
import { authRouter } from "./routes/auth";
import { domainsRouter } from "./routes/domains";
import { healthRouter } from "./routes/health";
import { instancesRouter } from "./routes/instances";

const openAPIConfig: Partial<GenerateSpecOptions> = {
	documentation: {
		info: {
			version: "1.0.0",
			title: "LAVIAC API",
			description:
				"LeiCraft_MC Auth Virtual Instance Admin Console — manage Zitadel virtual instances, their domains, and limits over the Zitadel System API.",
		},
		servers: [{ url: "/api/v1" }],
		security: [{ bearerAuth: [] }],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
				},
			},
			responses: {
				undefined: {
					description: "Authentication information is missing or invalid",
				},
			},
		},
		tags: [
			{ name: "System", description: "Service health and metadata." },
			{
				name: "Authentication",
				description: "Zitadel OIDC login/logout and the current-user endpoint.",
			},
			{ name: "Instances", description: "Virtual instance CRUD over the Zitadel System API." },
			{
				name: "Domains",
				description: "Cross-instance and per-instance custom domain management.",
			},
			{ name: "Limits", description: "Per-instance limits and quota." },
		],
		// @ts-ignore — x-tagGroups is valid OpenAPI but not typed by this hono-openapi version.
		"x-tagGroups": [
			{ name: "System", tags: ["System"] },
			{ name: "Authentication", tags: ["Authentication"] },
			{ name: "Instances", tags: ["Instances", "Domains", "Limits"] },
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