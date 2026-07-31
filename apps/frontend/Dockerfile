FROM node:22-bookworm-slim AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm ci

COPY apps/frontend apps/frontend
RUN npm run build --workspace=apps/frontend

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Standalone output nests under the monorepo path (apps/frontend) because
# outputFileTracingRoot points at the repo root.
COPY --from=builder /repo/apps/frontend/.next/standalone ./
COPY --from=builder /repo/apps/frontend/public ./apps/frontend/public
COPY --from=builder /repo/apps/frontend/.next/static ./apps/frontend/.next/static

EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
