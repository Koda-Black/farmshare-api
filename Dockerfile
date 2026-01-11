# =============================================================================
# FarmShare API - Production Dockerfile
# =============================================================================
# Multi-stage build for optimized production image
# 
# Build: docker build -t farmshare-api .
# Run:   docker run -p 8282:8282 --env-file .env farmshare-api
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

# Install necessary build tools for native modules
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Copy package files
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

# Install dependencies
RUN yarn install --immutable

# -----------------------------------------------------------------------------
# Stage 2: Builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.yarn ./.yarn
COPY --from=deps /app/.yarnrc.yml ./

# Copy source code
COPY . .

# Generate Prisma client
RUN yarn prisma generate

# Build the application
RUN yarn build

# Remove dev dependencies
RUN yarn workspaces focus --production

# -----------------------------------------------------------------------------
# Stage 3: Production Runner
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

# Add labels for container metadata
LABEL maintainer="FarmShare Team"
LABEL version="1.0.0"
LABEL description="FarmShare Marketplace API"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8282

# Install runtime dependencies only
RUN apk add --no-cache \
    # For Prisma
    openssl \
    # For health checks
    curl \
    # For Tesseract OCR (if needed)
    tesseract-ocr

# Copy built application
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma

# Copy Tesseract trained data if exists
COPY --from=builder --chown=nestjs:nodejs /app/eng.traineddata ./eng.traineddata

# Switch to non-root user
USER nestjs

# Expose the application port
EXPOSE 8282

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8282/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]
