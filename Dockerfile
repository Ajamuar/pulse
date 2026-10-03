FROM node:24-slim AS build
# On both stages, so the classic builder's leftover stage images can be pruned without touching other projects:
# docker image prune -f --filter label=app=pulse
LABEL app=pulse
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# The password reset script runs outside the Next server, so it gets its own bundle with pg and better-auth inside.
RUN pnpm exec esbuild scripts/reset-password.mjs --bundle --platform=node --format=esm --target=node24 --external:pg-native \
  --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);" --outfile=build-scripts/reset-password.mjs

FROM node:24-slim
LABEL app=pulse
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Memory: fewer glibc malloc arenas and a small V8 young generation keep RSS low (idle ~100 MB). The heap
# cap scales with the container's memory limit (50% of compose's 384m = 192 MB). See docs/setup.md.
ENV MALLOC_ARENA_MAX=2 NODE_OPTIONS="--max-old-space-size-percentage=50 --max-semi-space-size=2"
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Migrations run at boot from process.cwd()/drizzle.
COPY --from=build --chown=node:node /app/drizzle ./drizzle
# `docker exec pulse node scripts/reset-password.mjs <email-or-username>` (no email server for resets).
COPY --from=build --chown=node:node /app/build-scripts/reset-password.mjs ./scripts/reset-password.mjs
USER node
EXPOSE 3000
# No curl in slim; node's fetch does it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server.js"]
