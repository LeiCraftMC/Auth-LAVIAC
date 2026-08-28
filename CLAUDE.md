# CLAUDE.md — Claude Code specifics

Read [`AGENTS.md`](AGENTS.md) first. This file adds Claude-Code-specific notes.

## Slash commands

Defined in [`.claude/settings.json`](.claude/settings.json):

- `/api-client` — regenerate the typed API client (start `bun run dev` first; spec at
  `http://localhost:3000/api/docs/v1/openapi`).
- `/db` — generate / push / migrate Drizzle migrations.
- `/verify` — Biome + typecheck + tests.
- `/typecheck` — `bun run typecheck` (`nuxt typecheck` + `tsc`).
- `/test` — `bun test`.
- `/dev` — start / inspect the dev setup.

## MCP servers

`mcpServers` in `.claude/settings.json` and `.vscode/mcp.json` both register `nuxt` and
`nuxt-ui`. Use them when editing components, composables, or NuxtUI styling.

## API client

Run `bun run api-client:generate` after backend route changes. Generated files live in
`app/api-client/` — never hand-edit them (`*.gen.ts`).

## Env

Copy `example.env` to `.env` and fill in the Zitadel + OIDC vars before running. The server
boots without them (Zitadel/OIDC vars are optional and validated lazily), but auth and instance
routes will error until they are set.