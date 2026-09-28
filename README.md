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
├── app/                         # Nuxt 4 dashboard (NuxtUI v4 + Tailwind v4, dark-first)
│   ├── pages/{auth, instances}/ # login, instance list / create / detail
│   ├── components/{layout, dashboard}/
│   ├── composables/             # useAPI, stores, cookies
│   └── api-client/              # GENERATED — typed SDK from the backend OpenAPI spec
├── server/                      # Hono backend (mounted in Nitro at /api)
│   ├── lib/api/                 # API class, v1 router, route models, OpenAPI/Scalar
│   ├── lib/zitadel/             # System API client + system-user JWT (RS256)
│   ├── lib/oidc/                # Zitadel OIDC handler (Authorization Code + PKCE)
│   ├── lib/db/                  # Drizzle/SQLite — sessions + audit log + metadata
│   ├── lib/utils/               # config, logger, audit, constants (token prefix)
│   ├── routes/api/[...].ts      # Nitro catch-all → Hono
│   └── plugins/startup.ts       # boot: config → DB → API
├── drizzle/configs/             # drizzle-kit config; committed migrations in drizzle/migrations/
└── openapi-ts.config.ts         # frontend client generation (spec written by the script)
```

- **Admin login**: Zitadel OIDC with a **required static fallback**. Via OIDC, LAVIAC is a
  confidential client; the backend exchanges the code, reads the
  `urn:zitadel:iam:org:project:roles` claim, and admits users with the configured admin role. The
  static fallback (`LAVIAC_STATIC_AUTH_USERNAME`, default `admin`, + `LAVIAC_STATIC_AUTH_PASSWORD_HASH`,
  a `Bun.password`/argon2id hash — generate with `bun run hash-password`) is required at boot and
  always available on the login page. Both methods create the same opaque session token
  (`laviac_sess_<id>:<base>`): the
  base is stored only as a `Bun.password` hash in SQLite, the token travels in the
  `laviac_session_token` cookie and as `Authorization: Bearer`.
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
bun run dev              # http://localhost:12191
```

Generate the typed API client (no dev server needed — the script boots the Hono API in-process):

```bash
bun run api-client:generate
```

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Nuxt dev server on port 12191 (frontend + API). |
| `bun run build` / `start` | Build and run the production Bun Nitro server. |
| `bun run typecheck` | `nuxt typecheck` + `tsc` (covers `server/` + `tests/`). |
| `bun run test` | `bun test`. |
| `bunx biome check` | Format + lint. |
| `bun run api-client:generate` | Regenerate `app/api-client/*.gen.ts` (in-process spec). |
| `bun run db:generate` / `db:push` / `db:migrate` | Drizzle migration flow. |
| `bun run hash-password` | Argon2id hash for `LAVIAC_STATIC_AUTH_PASSWORD_HASH`. |

## Environment

See [`example.env`](example.env). Key variables:

- `LAVIAC_ZITADEL_AUTH_URL` — public Zitadel auth URL (the OIDC issuer).
- `LAVIAC_ZITADEL_SYSTEM_API_URL` — Zitadel System API base URL (system-user JWT audience); may differ from the auth URL (e.g. a local endpoint).
- `LAVIAC_ZITADEL_SYSTEM_USER_ID` + `..._PRIVATE_KEY` (or `..._PRIVATE_KEY_PATH`) — system API user.
- `LAVIAC_OIDC_CLIENT_ID` / `..._CLIENT_SECRET` / `..._ADMIN_ROLE` — admin OIDC.
- `LAVIAC_STATIC_AUTH_USERNAME` / `..._PASSWORD_HASH` — static fallback login; the hash is **required** at boot.
- `LAVIAC_APP_URL` / `NUXT_PUBLIC_APP_URL` — public URL of the dashboard (OIDC redirect, client baseURL).

## v1 scope

Instance CRUD, custom domain management, and limits over the v1 System API, plus OIDC admin login
and an audit log. Per-instance Admin-API settings (login policy, branding, password complexity)
are Phase 2.

## License

[AGPL-3.0](LICENSE).