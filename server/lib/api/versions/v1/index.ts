/**
 * APIv1Router — mounts all v1 resource routers. Mounted at /api/v1 by the API class.
 */
import { APIVersionRouter } from "../../utils/api-version-router";
import { authRouter } from "./routes/auth";
import { domainsRouter } from "./routes/domains";
import { healthRouter } from "./routes/health";
import { instancesRouter } from "./routes/instances";

export class APIv1Router extends APIVersionRouter {
	constructor() {
		super({
			version: 1,
			openAPIConfig: {
				documentation: {
					info: {
						version: "1.0.0",
						title: "LAVIAC API",
						description:
							"LeiCraft Auth Virtual Instance Admin Console — manage Zitadel virtual instances, their domains, and limits over the Zitadel System API.",
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
					},
				},
			},
			routes: [healthRouter, authRouter, instancesRouter, domainsRouter],
		});
	}
}
