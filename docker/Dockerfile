FROM oven/bun

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/laviac

# The Nitro "bun" preset bundles dependencies into .output/ — only the build output is
# needed at runtime. The CI pipeline runs `bun run build` before `docker build`.
COPY .output /opt/laviac/app

EXPOSE 12400/tcp

ENV NITRO_ENV=production
ENV NITRO_HOST=::
ENV NITRO_PORT=12400

ENV LAVIAC_DB_PATH=/opt/laviac/data/db.sqlite
ENV LAVIAC_DB_AUTO_MIGRATE=true
ENV LAVIAC_CONFIG_BASE_DIR=/opt/laviac/config

CMD [ "bun", "run", "./app/server/index.mjs" ]