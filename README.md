# LAVIAC

**LeiCraft_MC Auth Virtual Instance Admin Console** — a management dashboard for
[Zitadel](https://zitadel.com) **virtual instances**. It exposes the cross-instance control that
the regular Zitadel admin console does **not** provide: creating, editing, and deleting virtual
instances, managing their custom domains, and setting limits — over the Zitadel **System API**
(self-hosted only).

Built on the LeiCraft_MC [Style Guide](../../Style-Guides) as a **full-stack Nuxt 4 app** with the
Hono backend mounted inside Nitro (`server/`).

## Architecture

```
LAVIAC/
├── app/                         # Nuxt 4 dashboard (NuxtUI v3 + Tailwind v4, dark-first)
│   ├── pages/{auth, instances}/ # login, instance list / create / detail
│   ├── components/{layout, dashboard}/
│   ├── composables/             # useAPI, stores, cookies
│   └── api-client/              # GENERATED — typed SDK from the backend OpenAPI spec
├── server/                      # Hono backend (mounted in Nitro at /api)
│   ├── lib/api/                 # API class, v1 router, route models, OpenAPI/Scalar
│   ├── zitadel/                 # System API client + system-user JWT (RS256)
│   ├── oidc/                    # Zitadel OIDC handler (Authorization Code + PKCE)
│   ├── db/                      # Drizzle/SQLite — sessions + audit log
│   ├── routes/api/[...].ts      # Nitro catch-all → Hono
│   └── plugins/startup.ts       # boot: config → DB → API
└── openapi-ts.config.ts         # frontend client generation (spec at /api/docs/v1/openapi)
```

- **Admin login**: Zitadel OIDC. LAVIAC is a confidential OIDC client; the backend exchanges the
  code, reads the `urn:zitadel:iam:org:project:roles` claim, and admits users with the configured
  admin role. An opaque session token is stored in SQLite and carried in the
  `laviac_session_token` cookie.
- **System API auth**: a **system API user** — an RSA keypair whose public key is registered in
  Zitadel runtime settings (`SystemAPIUsers`). The backend mints a self-signed RS256 JWT and sends
  it directly as `Authorization: Bearer` to `/system/v1/*`. See
  <https://zitadel.com/docs/guides/integrate/zitadel-apis/access-zitadel-system-api>.

## Prerequisites

- Zitadel **self-hosted** (the System API is not available on Zitadel Cloud).
- A system API user configured in Zitadel runtime settings with `SYSTEM_OWNER`/`IAM_OWNER`
  memberships and the public key installed.
- An OIDC client (Authorization Code + PKCE) registered in Zitadel for LAVIAC, with redirect URI
  `${LAVIAC_APP_URL}/api/v1/auth/callback`, and a project role (default `laviac_admin`) granted to
  dashboard admins.
- [Bun](https://bun.sh) and the LeiCraft_MC Style-Guides repo at `../../Style-Guides`.

## Setup

```bash
bun install
cp example.env .env      # fill in the Zitadel + OIDC vars
bun run db:generate      # generate the SQLite migrations
bun run db:push          # apply them to the local DB
bun run dev              # http://localhost:3000
```

Generate the typed API client (start the dev server first so the OpenAPI spec is served):

```bash
bun run api-client:generate
```

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Nuxt dev server (port 3000). |
| `bun run build` / `start` | Build and run the production Bun Nitro server. |
| `bun run typecheck` | `nuxt typecheck` + `tsc` against the typecheck tsconfig. |
| `bun run test` | `bun test`. |
| `bunx biome check` | Format + lint. |
| `bun run api-client:generate` | Regenerate `app/api-client/*.gen.ts` from `/api/docs/v1/openapi`. |
| `bun run db:generate` / `db:push` / `db:migrate` | Drizzle migration flow. |

## Environment

See [`example.env`](example.env). Key variables:

- `LAVIAC_ZITADEL_URL` — Zitadel base URL (also the OIDC issuer).
- `LAVIAC_ZITADEL_SYSTEM_USER_ID` + `..._PRIVATE_KEY` (or `..._PRIVATE_KEY_PATH`) — system API user.
- `LAVIAC_OIDC_CLIENT_ID` / `..._CLIENT_SECRET` / `..._ADMIN_ROLE` — admin OIDC.
- `LAVIAC_APP_URL` — public URL of the dashboard (used for the OIDC redirect).

## v1 scope

Instance CRUD, custom domain management, and limits over the v1 System API, plus OIDC admin login
and an audit log. Per-instance Admin-API settings (login policy, branding, password complexity)
are Phase 2.

## License

[AGPL-3.0](LICENSE).