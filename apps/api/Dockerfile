FROM node:22-bookworm

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/types/package.json ./packages/types/package.json
RUN pnpm install --frozen-lockfile

COPY . .
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV SHADOW_DATABASE_URL=postgresql://build:build@localhost:5432/build_shadow
RUN pnpm --filter types build \
    && pnpm --filter api exec prisma generate \
    && pnpm --filter api build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter api db:migrate:deploy && pnpm --filter api start:prod"]