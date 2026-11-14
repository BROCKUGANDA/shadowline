# SHADOWLINE production image (audit roadmap P2).
#
# Multi-stage build on the official Bun image producing the Next.js
# standalone server (~small runtime surface: no node_modules copy).
#
#   docker build -t shadowline .
#   docker run -p 3000:3000 -e SESSION_SECRET=<16+ chars> shadowline
#
# NOTE (honest scope): this container image is provided and buildable, but
# its runtime has NOT been verified in the audit environment (no container
# runtime available there — see the commercial audit, F-09/P2). The app
# itself builds and runs as `bun .next/standalone/server.js` (verified);
# this image packages exactly that artifact.

# ---------- Stage 1: install ----------
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------- Stage 2: build ----------
FROM oven/bun:1 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client generation + Next standalone build
RUN bunx prisma generate \
 && bun run build \
 && cp -r .next/static .next/standalone/.next/ \
 && cp -r public .next/standalone/

# ---------- Stage 3: runtime ----------
FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Non-root user
RUN addgroup --system shadowline && adduser --system --ingroup shadowline shadowline
COPY --from=build --chown=shadowline:shadowline /app/.next/standalone ./
COPY --from=build --chown=shadowline:shadowline /app/prisma ./prisma
# The SQLite database lives on a volume so scouting reports survive restarts.
VOLUME ["/app/db"]
USER shadowline
EXPOSE 3000
# Fails closed: SESSION_SECRET must be provided at run time (audit F-05).
CMD ["bun", "server.js"]
