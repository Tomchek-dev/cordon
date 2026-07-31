FROM node:22-bookworm-slim AS builder
WORKDIR /repo

# Preserve the npm workspaces layout so `npm ci` resolves the same way it
# does locally, instead of installing apps/backend in isolation.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
RUN npm ci

COPY apps/backend apps/backend
RUN npx prisma generate --schema=apps/backend/prisma/schema.prisma \
  && npm run build --workspace=apps/backend

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /repo/apps/backend/package.json ./package.json
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/backend/dist ./dist
COPY --from=builder /repo/apps/backend/prisma ./prisma
COPY --from=builder /repo/apps/backend/prisma.config.ts ./prisma.config.ts

RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]

EXPOSE 3001
CMD ["node", "dist/src/main"]
