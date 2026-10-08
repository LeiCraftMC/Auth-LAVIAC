# LAVIAC

**LeiCraft_MC Auth Virtual Instance Admin Console** — a management dashboard for
[Zitadel](https://zitadel.com) **virtual instances** and the VM they run on. It exposes the
cross-instance control that the regular Zitadel admin console does **not** provide — creating,
editing and deleting virtual instances, their custom domains, limits and branding — over the
Zitadel **System API** (self-hosted only), plus admin tools for the whole deployment.

Built on the LeiCraft_MC [Style Guide](../../Style-Guides) as a **full-stack Nuxt 4 app** with the
Hono backend mounted inside Nitro (`server/`).

## Features

- **Instances** — list, create (human or machine owner), rename, delete; custom domains and the
  primary domain; limits (audit-log retention, block).
- **Templates** — every instance is created from a template (Private, Public B2B & B2C, Public
  B2C only, Public B2B only, Minimal). The first org is always `SYSTEM` (Zitadel's own project and
  the initial admin, locked down); a background task applies a security baseline, the template's
  sign-in defaults and its home org, which becomes the default org. The Templates page shows what
  each template sets; each instance's Template tab shows what was applied and can re-apply it.
- **Default branding** — every new instance gets the LeiCraft_MC branding through a background
  task: dark theme only, background `#020719`, primary `#0392CA`, warning `#FF6467`, font color
  `#FFFFFF`, the Rubik font and no Zitadel watermark. Each instance's Branding tab compares its
  label policy with the defaults and can re-apply them.
- **Admin tools** (`/dashboard/admin/…`)
  - **Statistics** — instances per state, per month and per Zitadel version, domains, org and
    user counts across all instances, audit activity.
  - **System** — the host VM: OS, kernel, virtualization, uptime, live CPU/memory/swap/disk
    meters, 7-day history charts, Zitadel reachability, the LAVIAC process.
  - **Updates** — pending apt package updates of the host VM (security ones flagged), the reboot
    flag, and the latest Zitadel release compared with the instances' versions.
  - **Audit Log**, **Tasks** (background tasks with logs) and **Sessions** (who is signed in,
    revoke).

## Architecture

```
LAVIAC/
├── app/                              # Nuxt 4 dashboard (NuxtUI v4 + Tailwind v4, dark-only)
│   ├── pages/dashboard/              # overview, instances/…, admin/…
│   ├── components/{dashboard,chart,instance,form,img}/
│   ├── composables/                  # useAPI, stores, cookies, subrouter helpers
│   └── api-client/                   # GENERATED — typed SDK from the backend OpenAPI spec
├── server/                           # Hono backend (mounted in Nitro at /api)
│   ├── lib/api/                      # API class, v1 router, route models, OpenAPI/Scalar
│   ├── lib/zitadel/                  # System API client, system-user JWT, branding, releases
│   ├── lib/host/                     # host VM info, metrics sampling, apt update check
│   ├── lib/tasks/                    # TaskScheduler + the applyDefaultBranding task
│   ├── lib/oidc/                     # Zitadel OIDC handler (Authorization Code + PKCE)
│   ├── lib/db/                       # Drizzle/SQLite — sessions, audit log, tasks, metrics, metadata
│   ├── lib/utils/                    # config, logger, audit, cron, constants
│   ├── assets/branding/              # the default-branding font (Nitro server asset)
│   ├── routes/api/[...].ts           # Nitro catch-all → Hono
│   └── plugins/startup.ts            # boot: config → DB → tasks → cron → API
├── drizzle/                          # drizzle-kit config + committed migrations
└── docker/                           # Dockerfile + docker-compose.yml
```

- **Admin login**: Zitadel OIDC with a **required static fallback**. Via OIDC, LAVIAC is a
  confidential client; the backend exchanges the code, reads the
  `urn:zitadel:iam:org:project:roles` claim, and admits users with the configured admin role. The
  static fallback (`LAVIAC_STATIC_AUTH_USERNAME`, default `admin`, + `LAVIAC_STATIC_AUTH_PASSWORD_HASH`,
  a `Bun.password`/argon2id hash — generate with `bun run hash-password`) is required at boot and
  always available on the login page. Both methods create the same opaque session token
  (`laviac_sess_<id>:<base>`).
- **System API auth**: a **system API user** — an RSA keypair whose public key is registered in
  Zitadel runtime settings (`SystemAPIUsers`). The backend mints a self-signed RS256 JWT and sends
  it as `Authorization: Bearer` to `/system/v1/*`, and — with the `x-zitadel-instance-host`
  header — to the Admin, Management and v2 APIs of a single instance (templates, branding, usage
  counts).

## Prerequisites

- Zitadel **self-hosted** (the System API is not available on Zitadel Cloud).
- A system API user in Zitadel's runtime settings with the public key installed and a `System`
  membership holding `SYSTEM_OWNER` **and** `IAM_OWNER` (the latter for the templates, the default
  branding and the org/user statistics — see `example.env`).
- An OIDC client (Authorization Code + PKCE) registered in Zitadel for LAVIAC, with redirect URI
  `${LAVIAC_APP_URL}/api/v1/auth/callback`, and a project role (default `laviac_admin`) granted to
  dashboard admins.
- For the host tools in Docker: the host's `/` mounted read-only and `LAVIAC_HOST_ROOT` pointing
  at it (see `docker/docker-compose.yml`). Package updates need a Debian/Ubuntu host.
- [Bun](https://bun.sh) and the LeiCraft_MC Style-Guides repo at `../../Style-Guides`.

## Setup

```bash
bun install
cp example.env .env      # fill in the Zitadel + OIDC vars
bun run dev              # http://localhost:12191 (migrations run on startup)
```

Regenerate the typed API client after backend route changes (no dev server needed — the script
boots the Hono API in-process):

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
| `bun run check:ci` | Biome format + lint check. |
| `bun run api-client:generate` | Regenerate `app/api-client/*.gen.ts` (in-process spec + patch). |
| `bun run db:generate` / `db:push` / `db:migrate` | Drizzle migration flow. |
| `bun run hash-password` | Argon2id hash for `LAVIAC_STATIC_AUTH_PASSWORD_HASH`. |

## Environment

See [`example.env`](example.env). Key variables:

- `LAVIAC_ZITADEL_AUTH_URL` — public Zitadel auth URL (the OIDC issuer).
- `LAVIAC_ZITADEL_SYSTEM_API_URL` — Zitadel System API base URL (system-user JWT audience); may differ from the auth URL (e.g. a local endpoint).
- `LAVIAC_ZITADEL_SYSTEM_USER_ID` + `..._PRIVATE_KEY` (or `..._PRIVATE_KEY_PATH`) — system API user.
- `LAVIAC_ZITADEL_APPLY_DEFAULT_BRANDING` — brand new instances (default `true`).
- `LAVIAC_OIDC_CLIENT_ID` / `..._CLIENT_SECRET` / `..._ADMIN_ROLE` — admin OIDC.
- `LAVIAC_STATIC_AUTH_USERNAME` / `..._PASSWORD_HASH` — static fallback login; the hash is **required** at boot.
- `LAVIAC_HOST_ROOT` — where the host VM's filesystem is visible (`/`, or `/host` in Docker).
- `LAVIAC_APP_URL` — public URL of the dashboard (OIDC redirect, client baseURL; mapped onto `NUXT_PUBLIC_APP_URL`).

## License

[AGPL-3.0](LICENSE).
