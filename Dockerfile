FROM node:22-bookworm AS base
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install system dependencies for Claude Code CLI
RUN apt-get update && apt-get install -y \
    git \
    curl \
    cron \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI and plugins
RUN npm install -g @anthropic-ai/claude-code \
    && claude plugins marketplace add anthropics/claude-plugins-official \
    && claude plugins install superpowers \
    && claude plugins install frontend-design

# Dev stage: mount source, install deps, run with tsx
FROM base AS dev
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
# Source is bind-mounted at runtime, not copied
CMD ["sh", "-c", "pnpm run db:migrate && pnpm run dev"]

# Prod stage: copy built assets, run compiled JS
FROM base AS prod
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY dist/ ./dist/
CMD ["sh", "-c", "pnpm run db:migrate && pnpm start"]
