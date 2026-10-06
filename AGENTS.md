# AGENTS.md — operating manual for AI coding agents

LAVIAC (LeiCraft_MC Auth Virtual Instance Admin Console) is the management dashboard for
Zitadel **virtual instances** and the VM they run on. It is a **full-stack Nuxt 4 app** with the
Hono backend mounted inside Nitro (`server/`). The authoritative house style is the
[LeiCraft_MC Style Guide](../../Style-Guides/AGENTS.md) — read it first; the
[`fullstack-nuxt-app` template](../../Style-Guides/templates/fullstack-nuxt-app/) is the reference
implementation.

## Shape

Full-stack Nuxt (Nuxt 4 `app/` srcDir + Hono in `server/`). The Hono `API` class runs inside
Nitro; a catch-all `server/routes/api/[...].ts` forwards `/api/**` to it. Endpoints are
`/api/v1/<resource>`, `/api/health`, `/api/docs/v1` (Scalar). No `Bun.serve`, no `Main.main()` —
a `server/plugins/startup.ts` Nitro plugin boots config → DB → tasks → cron → API. See
Style-Guides [docs/01](../../Style-Guides/docs/01-project-structure.md) and
[docs/04 (Mounting Hono in Nitro)](../../Style-Guides/docs/04-backend-hono.md).

## Non-negotiable rules (from the style guide)

- **Never hand-edit `*.gen.ts`** under `app/api-client/` — regenerate with
  `bun run api-client:generate` (runs `openapi-ts` + `scripts/patch-api-client.ts`).
- **Every API response uses the `{ success, code, message, data }` envelope** via `APIResponse`.
- **Validate with `zValidator` from `hono-openapi`** (not `@hono/zod-validator`).
- **Copy shared utilities** from `../../Style-Guides/shared/` and the template — do not
  re-invent (`Logger`, `ConfigSchema`, `APIResponse`, `useAPI`, `AbstractStore`, `DataTable`,
  `TaskScheduler`, `CronJobHandler`, `RuntimeMetadata`).
- **Format with Biome** (`bun run check:ci`); **Conventional Commits**.
- **All API access in the frontend goes through `useAPI`** — never raw `$fetch`.

## LAVIAC specifics (divergences from the guide, recorded here)

1. **Admin auth = Zitadel OIDC + env-based static fallback.** OIDC (Authorization Code + PKCE via
   `openid-client`) is the primary login; the guide's docs/10 covers opaque bearer sessions only,
   and LAVIAC additionally is an OIDC client of the master Zitadel instance. On top of that, a
   static admin account (`LAVIAC_STATIC_AUTH_USERNAME`, default `admin` +
   `LAVIAC_STATIC_AUTH_PASSWORD_HASH`, a `Bun.password` argon2id hash) is REQUIRED at boot —
   the schema gives the hash no default — and always shows on the login page alongside the OIDC
   button. The guide's own bootstrap is a DB-seeded initial admin with a reset-token file
   (docs/08), which LAVIAC deliberately does not use because admins normally come from Zitadel.
   Sessions otherwise follow docs/10 exactly: opaque `laviac_sess_<id>:<base>` tokens (id = row
   primary key, base stored only as a `Bun.password` hash, 7-day default TTL, purged on access),
   timing-safe dummy-hash verify + in-memory rate limiter on login (docs/10 hardening), and the
   `laviac_session_token` cookie with the docs/10 defaults (`secure; sameSite=lax; httpOnly:false`).
   Consequently there are no local users: no `users` table, no account/settings/API-key/onboarding
   pages, and `scheduled_tasks.created_by_user_sub` (the session's `user_sub`) replaces the
   template's `created_by_user_id`.
2. **Admin authorization = Zitadel project role.** The role claim
   `urn:zitadel:iam:org:project:roles` must contain the configured role
   (`LAVIAC_OIDC_ADMIN_ROLE`, default `laviac_admin`). The cached `user_role` column in
   `sessions` stores this as a string enum (`UserAccountSettings.Roles` in
   `server/lib/api/utils/shared-models/accountData.ts`). Every router (`instances`, `domains`,
   `admin`) carries the template's admin guard inline.
3. **Zitadel System API auth = system-user JWT.** A self-signed RS256 JWT (RSA keypair registered
   in Zitadel `SystemAPIUsers` runtime settings) is sent directly as `Bearer` to
   `/system/v1/*`. This is the only System API auth method (self-hosted only). The System API
   base URL (`LAVIAC_ZITADEL_SYSTEM_API_URL`, also the JWT audience) is a SEPARATE setting from
   the OIDC auth URL (`LAVIAC_ZITADEL_AUTH_URL`). See `server/lib/zitadel/jwt.ts` and
   <https://zitadel.com/docs/guides/integrate/zitadel-apis/access-zitadel-system-api>.
   The **instance-scoped** calls (label policy, font upload, org/user counts) reuse that JWT and
   select the instance with the `x-zitadel-instance-host` header; they need the system user to
   hold `IAM_OWNER` through a `System` membership (documented in `example.env`).
4. **DB layer is dialect-neutral.** `server/lib/db/index.ts` exposes `DB.instance()` and
   `DB.Tables` / `DB.Models`. No initial-admin bootstrap here.
5. **Default branding runs as a background task.** `POST /instances` queues the step-based
   `applyDefaultBranding` task (`server/lib/tasks/applyDefaultBranding.ts`): resolve the instance
   domain → `PUT /admin/v1/policies/label` → upload the font → activate, with retries while the
   new instance becomes addressable. The values live in `server/lib/zitadel/branding.ts`
   (`ZitadelBranding.DEFAULT_LABEL_POLICY`); the font is a Nitro **server asset**
   (`server/assets/branding/rubik-600.woff2`), so its loader is registered in the startup plugin
   and it is unavailable outside Nitro (tests, api-client generation). Disable with
   `LAVIAC_ZITADEL_APPLY_DEFAULT_BRANDING=false`. The startup plugin does **not** await
   `TaskScheduler.processQueue()` (the template does) so retrying branding tasks never hold back
   `API.init`.
6. **Host-VM tooling reads below `LAVIAC_HOST_ROOT`.** `server/lib/host/` serves the host
   snapshot, per-minute metrics (`host_metrics`, 7-day retention, written by the cron job) and
   the apt update check. In Docker the host's `/` is mounted read-only (`/:/host:ro`) and
   `LAVIAC_HOST_ROOT=/host`; kernel values (CPU, load, memory, uptime) come from `/proc` and are
   the host's either way.
7. **No public pages.** `/` redirects to `/dashboard`; `public/robots.txt` disallows everything
   and there is no sitemap. The auth layout and `error.vue` still use the template's
   `LayoutHeader` / `LayoutFooter`.

## Key locations

- Backend routes: `server/lib/api/versions/v1/routes/`
  - `auth/` — OIDC login/callback, static login, methods, logout, session (= the current admin)
  - `instances/` (+ `domains/`, `limits/`, `branding/`) — instance CRUD over the System API
  - `domains/` — cross-instance domain checks
  - `admin/` (`statistics/`, `host/`, `updates/`, `audit/`, `tasks/`, `sessions/`) — admin tools
- Zitadel: `server/lib/zitadel/{client,jwt,types,branding,releases,usage}.ts`; Zitadel → API
  mappers + error mapping in `server/lib/api/utils/zitadel.ts`.
- Host VM: `server/lib/host/{info,metrics,updates}.ts`; cached statuses in
  `server/lib/api/utils/metadata.ts` (`RuntimeMetadata`).
- Background work: `server/lib/tasks/` (`TaskScheduler`), `server/lib/utils/cron.ts`
  (`CronJobHandler`: metrics every minute, cleanup hourly, update checks every 6 h).
- OIDC/session: `server/lib/oidc/handler.ts`, `server/lib/api/utils/authHandler.ts`.
- DB/audit: `server/lib/db/{index,schema,utils}.ts`, `server/lib/utils/audit.ts`.
- Frontend: `app/pages/dashboard/` (overview, `instances/`, `instances/[instance_id]/…`,
  `admin/…`), `app/components/{dashboard,chart,instance,layout,form,img}/`.
- Config: `server/lib/utils/config.ts` (all `LAVIAC_*` env vars; `example.env` documents them).

## Before declaring done

`bun run check:ci` clean · `bun run typecheck` passes · `bun test` passes. Regenerate the API
client after any backend route change.

`nuxt typecheck` run through `bunx --bun` currently exits 0 **without** checking `.vue` files; also
run `bunx vue-tsc --noEmit -p .nuxt/tsconfig.app.json` after frontend changes.
