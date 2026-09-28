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

1. **Admin auth = Zitadel OIDC + env-based static fallback.** OIDC (Authorization Code + PKCE via
   `openid-client`) is the primary login; the guide's docs/10 covers opaque bearer sessions only,
   and LAVIAC additionally is an OIDC client of the master Zitadel instance. On top of that, a
   static admin account (`LAVIAC_STATIC_AUTH_USERNAME`, default `admin` +
   `LAVIAC_STATIC_AUTH_PASSWORD_HASH`, a `Bun.password` argon2id hash) provides a fallback login
   alongside OIDC — the guide's own bootstrap is a DB-seeded initial admin with a reset-token file
   (docs/08), which LAVIAC deliberately does not use because admins normally come from Zitadel.
   Sessions otherwise follow docs/10 exactly: opaque `laviac_sess_<id>:<base>` tokens (id = row
   primary key, base stored only as a `Bun.password` hash, 7-day default TTL, purged on access),
   timing-safe dummy-hash verify + in-memory rate limiter on login (docs/10 hardening), and the
   `laviac_session_token` cookie — except `secure` is derived from `LAVIAC_APP_URL` instead of
   hardcoded `true`, so plain-http local development still works.
2. **Admin authorization = Zitadel project role.** The role claim
   `urn:zitadel:iam:org:project:roles` must contain the configured role
   (`LAVIAC_OIDC_ADMIN_ROLE`, default `laviac_admin`). The cached `user_role` column in
   `sessions` stores this as a string enum (`UserAccountSettings.Roles` in
   `server/lib/api/utils/shared-models/accountData.ts`).
3. **Zitadel System API auth = system-user JWT.** A self-signed RS256 JWT (RSA keypair registered
   in Zitadel `SystemAPIUsers` runtime settings) is sent directly as `Bearer` to
   `/system/v1/*`. This is the only System API auth method (self-hosted only). See
   `server/lib/zitadel/jwt.ts` and
   <https://zitadel.com/docs/guides/integrate/zitadel-apis/access-zitadel-system-api>.
4. **DB layer is dialect-neutral.** `server/lib/db/index.ts` exposes `DB.instance()` and
   `DB.Tables` / `DB.Models`. No initial-admin bootstrap here; admins are created in Zitadel and
   admitted by the OIDC role (or the static fallback). The `metadata` KV table is also standard.
5. **Generated API client uses `@hey-api/client-fetch`.** The style guide's docs/06 recommends
   `@hey-api/client-nuxt`, but `client-nuxt` v0.2.1 produces internal type errors under
   Windows/Bun/vue-tsc 3.3 (duplicate `AsyncData`/`NuxtError` symbols from `nuxt/app` vs `#app`).
   `useAPI` unwraps the `{ data, error, ... }` wrapper to the LAVIAC envelope. Once the upstream
   plugin is fixed, migrate back to `client-nuxt`.
6. **v1 scope = cross-instance control**: instance CRUD, custom domains, limits/quota over the
   v1 System API. Per-instance Admin-API settings (login policy, branding, password complexity)
   are **Phase 2** (needs a second service account + instance-context routing).
7. **SSR is globally disabled** (`routeRules: { "/**": { ssr: false } }`). docs/06 keeps SSR for
   public pages; LAVIAC has none — every route sits behind the auth guard — so the whole app
   renders client-side.

## Key locations

- Backend: `server/lib/api/versions/v1/routes/{health,auth,instances,domains}/`.
- Zitadel client: `server/lib/zitadel/{client.ts,jwt.ts,types.ts}`.
- OIDC/session: `server/lib/oidc/handler.ts`, `server/lib/api/utils/authHandler.ts`
  (`AuthUtils` / `SessionHandler` / `AuthHandler`), `server/lib/api/utils/rateLimiter.ts`.
- DB/audit: `server/lib/db/{index.ts,schema.ts,utils.ts}`, `server/lib/utils/audit.ts`.
- Frontend pages: `app/pages/{auth/login.vue, instances/}`. Components: `app/components/{layout,dashboard}/`.
- Config: `server/lib/utils/config.ts` (all `LAVIAC_*` env vars; `example.env` documents them);
  project constants incl. the `laviac_` token prefix: `server/lib/utils/constants.ts`.

## Before declaring done

`bunx biome check` clean · `bun run typecheck` passes · `bun test` passes. Regenerate the API
client after any backend route change.