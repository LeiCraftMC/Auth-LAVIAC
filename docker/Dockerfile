FROM oven/bun:1-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/leicraftmc/auth/laviac

COPY .output ./app/.output
COPY drizzle/migrations ./app/drizzle/migrations

EXPOSE 12191/tcp

ENV NITRO_ENV=production
ENV NITRO_HOST=::
ENV NITRO_PORT=12191

ENV LAVIAC_DB_PATH=/opt/leicraftmc/auth/laviac/data/db.sqlite
ENV LAVIAC_DB_AUTO_MIGRATE=true
ENV LAVIAC_DB_MIGRATION_DIR=/opt/leicraftmc/auth/laviac/app/drizzle/migrations

ENV LAVIAC_CONFIG_BASE_DIR=/opt/leicraftmc/auth/laviac/config


VOLUME /opt/leicraftmc/auth/laviac/data
VOLUME /opt/leicraftmc/auth/laviac/config

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
	CMD curl -f http://localhost:12191/health || exit 1

CMD [ "bun", "run", "/opt/leicraftmc/auth/laviac/app/.output/server/index.mjs" ]
