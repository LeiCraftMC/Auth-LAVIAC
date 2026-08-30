# AGENTS.md — operating manual for AI coding agents

LAVIAC (LeiCraft_MC Auth Virtual Instance Admin Console) is the management dashboard for
Zitadel **virtual instances**. It is a **full-stack Nuxt 4 app** with the Hono backend mounted
inside Nitro (`server/`). The authoritative house style is the
[LeiCraft_MC Style Guide](../../Style-Guides/AGENTS.md) — read it first.

## Shape

Full-stack Nuxt (Nuxt 4 `app/` srcDir + Hono in `server/`). The Hono `API` class runs inside
Nitro; a catch-all `server/routes/api/[...].ts` forwards `/api/**` to it. Endpoints are
`/api/v1/<resource>`, `/api/health`, `/api/docs/v1` (Scalar). No `Bun.serve`, no `Main.main()` —
a `server/plugins/startup.ts` Nitro plugin boots config → DB → API. See Style-Guides
[docs/01](../../Style-Guides/docs/01-project-structure.md) and
[docs/04 (Mounting Hono in Nitro)](../../Style-Guides/docs/04-backend-hono.md).

## Non-negotiable rules (from the style guide)

- **Never hand-edit `*.gen.ts`** under `app/api-client/` — regenerate with `bun run api-client:generate`.
- **Every API response uses the `{ success, code, message, data }` envelope** via `APIResponse`.
- **Validate with `zValidator` from `hono-openapi`** (not `@hono/zod-validator`).
- **Copy shared utilities** from `../../Style-Guides/shared/` — do not re-invent (`Logger`,
  `ConfigSchema`, `APIResponse`, `useAPI`, `AbstractStore`).
- **Format with Biome** (`bunx biome check`); **Conventional Commits**.
- **All API access in the frontend goes through `useAPI`** — never raw `$fetch`.

## LAVIAC specifics (divergences from the guide, recorded here)

1. **Admin auth = Zitadel OIDC** (Authorization Code + PKCE) via `openid-client`. The guide's
   docs/10 covers opaque bearer sessions only; LAVIAC is an OIDC client of the master Zitadel
   instance. Sessions are still opaque tokens in the `sessions` SQLite table (the cookie
   `laviac_session_token` is forwarded as `Authorization: Bearer` by `useAPI`).
2. **Admin authorization = Zitadel project role.** The role claim
   `urn:zitadel:iam:org:project:roles` must contain the configured role
   (`LAVIAC_OIDC_ADMIN_ROLE`, default `laviac_admin`).
3. **Zitadel System API auth = system-user JWT.** A self-signed RS256 JWT (RSA keypair registered
   in Zitadel `SystemAPIUsers` runtime settings) is sent directly as `Bearer` to
   `/system/v1/*`. This is the only System API auth method (self-hosted only). See
   `server/zitadel/jwt.ts` and
   <https://zitadel.com/docs/guides/integrate/zitadel-apis/access-zitadel-system-api>.
4. **v1 scope = cross-instance control**: instance CRUD, custom domains, limits/quota over the
   v1 System API. Per-instance Admin-API settings (login policy, branding, password complexity)
   are **Phase 2** (needs a second service account + instance-context routing).

## Key locations

- Backend: `server/lib/api/versions/v1/routes/{health,auth,instances,domains}/`.
- Zitadel client: `server/zitadel/{client.ts,jwt.ts,types.ts}`.
- OIDC: `server/oidc/handler.ts`. Session/audit: `server/db/schema.ts`, `server/utils/audit.ts`.
- Frontend pages: `app/pages/{auth/login.vue, instances/}`. Components: `app/components/{layout,dashboard}/`.
- Config: `server/utils/config.ts` (all `LAVIAC_*` env vars; `example.env` documents them).

## Before declaring done

`bunx biome check` clean · `bun run typecheck` passes · `bun test` passes. Regenerate the API
client after any backend route change.