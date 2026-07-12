# Build depuis la racine du repo (contexte pnpm workspace) :
#   docker build -f apps/web/Dockerfile -t fidwastafid-web .
# docker-compose.yml (racine) le fait déjà.

FROM node:22-alpine AS base
RUN corepack enable

# ---- deps : installe tout le workspace (le lockfile couvre tous les packages) ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# ---- builder : build Next.js standalone ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY . .
RUN pnpm --filter @fidwastafid/web build

# ---- runner : image finale minimale, non-root ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
