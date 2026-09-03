# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
EXPOSE 3030
# Production terminates TLS itself (see src/index.ts), every other NODE_ENV
# serves plain HTTP — probe whichever this container is actually running as.
# --no-check-certificate: we're hitting `localhost`, not the cert's own domain.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD sh -c 'if [ "$NODE_ENV" = "production" ]; then wget -q -O - --no-check-certificate https://localhost:3030/health; else wget -q -O - http://localhost:3030/health; fi' || exit 1
CMD ["node", "dist/index.js"]
