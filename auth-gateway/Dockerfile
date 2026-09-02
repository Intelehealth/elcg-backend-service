# ---- builder ----
#FROM node:20-alpine AS builder
#WORKDIR /app
#COPY package*.json tsconfig.json ./
#RUN npm ci
#COPY src ./src
#RUN npm run build

# ---- runtime ----
#FROM node:20-alpine AS runtime
#WORKDIR /app
#ENV NODE_ENV=production
#COPY package*.json ./
#RUN npm ci --omit=dev && npm cache clean --force
#COPY --from=builder /app/dist ./dist
#EXPOSE 3030
#HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
 # CMD wget -q -O - http://localhost:3030/health || exit 1
#CMD ["node", "dist/index.js"]

# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app

# Copy manifest files first so this layer only rebuilds when deps actually change
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

# Copy source and build
COPY src ./src
RUN npm run build

# Safety check: fail the build early if path aliases weren't rewritten
RUN if grep -q "require(\"@/" dist/index.js 2>/dev/null || grep -q "require('@/" dist/index.js 2>/dev/null; then \
      echo "ERROR: Unresolved @/ path alias found in dist/index.js — tsc-alias did not run correctly" && \
      exit 1; \
    else \
      echo "OK: path aliases resolved correctly"; \
    fi

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - http://localhost:3030/health || exit 1

CMD ["node", "dist/index.js"]
