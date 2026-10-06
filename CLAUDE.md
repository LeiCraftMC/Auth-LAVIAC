# CLAUDE.md — Claude Code specifics

Read [`AGENTS.md`](AGENTS.md) first. This file adds Claude-Code-specific notes.

## Slash commands

Defined in [`.claude/settings.json`](.claude/settings.json):

- `/api-client` — regenerate the typed API client (boots the API in-process; no dev server needed).
- `/db` — run Drizzle migrations.
- `/verify` — typecheck + tests.
- `/typecheck` — `bun run typecheck` (`nuxt typecheck` + `tsc`, includes `server/`). Also run
  `bunx vue-tsc --noEmit -p .nuxt/tsconfig.app.json` — see AGENTS.md.
- `/test` — `bun test`.
- `/dev` — start/inspect the dev setup.

## MCP servers

`mcpServers` in `.claude/settings.json` and `.vscode/mcp.json` both register `nuxt` and
`nuxt-ui`. Use them when editing components, composables, or NuxtUI styling.

## Backend in `server/`

This is the full-stack shape: Hono lives in `server/lib/api`, mounted at `/api` by
`server/routes/api/[...].ts`, and initialized by `server/plugins/startup.ts`. After changing a
backend route, regenerate the client with `bun run api-client:generate`. Never hand-edit
`app/api-client/*.gen.ts`.

## Frontend conventions

- Route map and access rules: the constants of `app/middleware/auth.global.ts` (`/dashboard/**`
  needs a session, `/dashboard/admin/**` the admin role).
- Reference components by their Nuxt auto-import names (`DashboardDataTable`,
  `DashboardSectionCard`, `ChartTimeSeries`, `InstanceStateBadge`, …). Don't add explicit imports
  that only the `<template>` uses.
- If a `<script>` binding is used as a type there and as a value in the `<template>` (e.g. a Zod
  schema for `UForm :schema`), also reference it as a value in `<script>`
  (`const renameSchema = zPutInstancesByInstanceIdBody`).
- Never run `biome check --write --unsafe` on `.vue` files.
- Charts (`app/components/chart/`) are inline SVG/HTML, single-series in the primary color, with
  hover + keyboard tooltips and a screen-reader table — keep new charts to that pattern.

## Env

Copy `example.env` to `.env` and fill in the Zitadel + OIDC vars before running. The server
boots without them (Zitadel/OIDC vars are optional and validated lazily), but auth and instance
routes will error until they are set.
