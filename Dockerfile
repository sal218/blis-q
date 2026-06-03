# Multi-stage build for the Blis-Q Express API server.
# The Expo client and admin dashboard are NOT part of this image (see
# .dockerignore) — this container runs the API only.

# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app

# Install all deps (incl. dev) for the esbuild bundle step.
COPY package*.json ./
RUN npm ci

# esbuild needs the server + shared source and tsconfig (for @shared/* path
# resolution). server:build bundles shared/ in and externalises node_modules.
COPY tsconfig.json ./
COPY shared ./shared
COPY server ./server
RUN npm run server:build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production deps only (esbuild externalised them, so they're needed at runtime).
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Run as the built-in non-root user.
USER node

EXPOSE 5000
CMD ["node", "dist/index.js"]
