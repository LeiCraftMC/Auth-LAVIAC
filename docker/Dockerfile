# Production image: the full-stack server bundle (.output/ — Nuxt + the Hono API, Bun preset) on
# the Bun runtime. Build it first (CI does this): `bun run build`. .output/ is self-contained;
# only the Drizzle migrations are copied next to it — DB.init applies them on startup
# (LAVIAC_DB_AUTO_MIGRATE) from LAVIAC_DB_MIGRATION_DIR. Layout: app under app/, data/
# and config/ are volumes beside it.
# Runtime config comes from the prefixed env: one `LAVIAC_APP_URL` drives both the API side
# (CORS, the OIDC redirect URI) and the browser's config — the Nitro banner in nuxt.config.ts maps
# it onto `NUXT_PUBLIC_APP_URL` at server start; NUXT_PUBLIC_* remains a pure override.
# The Debian base keeps `apt`, which the OS update check runs against the host's package database
# (mount the host's / read-only and set LAVIAC_HOST_ROOT — see docker-compose.yml).
FROM oven/bun:1-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /opt/leicraftmc/auth/laviac

COPY ./.output /opt/leicraftmc/auth/laviac/app/.output
COPY ./drizzle/migrations /opt/leicraftmc/auth/laviac/app/drizzle/migrations

EXPOSE 12191/tcp

ENV NODE_ENV=production

ENV NITRO_HOST=::
ENV NITRO_PORT=12191

ENV LAVIAC_DB_PATH=/opt/leicraftmc/auth/laviac/data/db.sqlite
ENV LAVIAC_DB_AUTO_MIGRATE=true
ENV LAVIAC_DB_MIGRATION_DIR=/opt/leicraftmc/auth/laviac/app/drizzle/migrations

ENV LAVIAC_LOG_DIR=/opt/leicraftmc/auth/laviac/data/logs
ENV LAVIAC_CONFIG_BASE_DIR=/opt/leicraftmc/auth/laviac/config


VOLUME /opt/leicraftmc/auth/laviac/data
VOLUME /opt/leicraftmc/auth/laviac/config

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
	CMD curl -f http://localhost:12191/api/health || exit 1

CMD ["bun", "run", "/opt/leicraftmc/auth/laviac/app/.output/server/index.mjs"]
