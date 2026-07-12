# Multi-stage build for CamiReads frontend
# Stage 1: Build the Next.js application
FROM node:20-alpine AS builder

WORKDIR /app

ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_CF_ACCESS_CLIENT_ID=
ARG NEXT_PUBLIC_CF_ACCESS_CLIENT_SECRET=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CF_ACCESS_CLIENT_ID=$NEXT_PUBLIC_CF_ACCESS_CLIENT_ID
ENV NEXT_PUBLIC_CF_ACCESS_CLIENT_SECRET=$NEXT_PUBLIC_CF_ACCESS_CLIENT_SECRET

# Copy package files
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* .npmrc* ./

# Install dependencies (supports npm, yarn, or pnpm)
RUN \
  if [ -f package-lock.json ]; then \
    npm ci; \
  elif [ -f pnpm-lock.yaml ]; then \
    corepack prepare pnpm@10.17.1 --activate && pnpm install --no-frozen-lockfile; \
  elif [ -f yarn.lock ]; then \
    yarn install --frozen-lockfile; \
  else \
    npm install; \
  fi

# Copy source code
COPY . .

# Build the application
# NEXT_PUBLIC_API_URL is inlined by Next.js during build for client-side code.
RUN \
  if [ -f package-lock.json ]; then \
    npm run build; \
  elif [ -f pnpm-lock.yaml ]; then \
    corepack prepare pnpm@10.17.1 --activate && pnpm run build; \
  elif [ -f yarn.lock ]; then \
    yarn build; \
  else \
    npm run build; \
  fi

# Stage 2: Production runtime
FROM node:20-alpine AS runtime

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy necessary files from builder
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Expose the port Next.js runs on
EXPOSE 3000

# Set default API URL for any runtime-side reads.
ENV NEXT_PUBLIC_API_URL=/api

# Start the Next.js application
CMD ["node", "server.js"]
