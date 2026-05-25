# syntax=docker/dockerfile:1.6
# Multi-stage build for the Wings Of World server. The final image runs as a non-root
# user, exposes /healthz for orchestrator probes, and mounts /data for state.

# Build stage
FROM node:22-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 needs a C++ toolchain for native rebuild on install.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN corepack enable \
    && corepack prepare pnpm@10.4.1 --activate \
    && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Runtime stage
RUN pnpm prune --prod

# Runtime stage
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    WINGS_OF_WORLD_DATA_DIR=/data \
    LOG_LEVEL=info

# Non-root user for the runtime; never run Node as root in production.
RUN groupadd --system --gid 1001 wings-of-world \
    && useradd  --system --uid 1001 --gid wings-of-world --shell /usr/sbin/nologin wings-of-world \
    && mkdir -p /data \
    && chown -R wings-of-world:wings-of-world /data

COPY --from=build --chown=wings-of-world:wings-of-world /app/dist ./dist
COPY --from=build --chown=wings-of-world:wings-of-world /app/node_modules ./node_modules
COPY --from=build --chown=wings-of-world:wings-of-world /app/package.json ./package.json
COPY --from=build --chown=wings-of-world:wings-of-world /app/scripts ./scripts
# NOTICE attribution for embedded third-party assets (Future AGI eval catalog).
COPY --from=build --chown=wings-of-world:wings-of-world /app/NOTICE ./NOTICE

USER wings-of-world
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
