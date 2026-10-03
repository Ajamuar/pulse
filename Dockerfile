# Build inside Linux: the standalone trace only keeps the better-sqlite3 binary for the build platform.
FROM node:24-slim AS build
# On both stages, so the classic builder's leftover stage images can be pruned without touching other projects:
# docker image prune -f --filter label=app=pulse
LABEL app=pulse
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
# pnpm runs node-gyp for better-sqlite3 (allowBuilds) because it ships binding.gyp; the app still loads
# the bundled prebuild, but the install fails without a toolchain. Build stage only.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-slim
LABEL app=pulse
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Memory: fewer glibc malloc arenas and a small V8 young generation keep RSS low (idle ~100 MB). The heap
# cap scales with the container's memory limit (50% of compose's 384m = 192 MB); a full 3-year recompute
# needs under 64 MB. Raise mem_limit and the heap follows. See docs/setup.md.
ENV MALLOC_ARENA_MAX=2 NODE_OPTIONS="--max-old-space-size-percentage=50 --max-semi-space-size=2"
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Migrations run at boot from process.cwd()/drizzle.
COPY --from=build --chown=node:node /app/drizzle ./drizzle
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data
USER node
VOLUME /app/data
EXPOSE 3000
# No curl in slim; node's fetch does it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server.js"]
