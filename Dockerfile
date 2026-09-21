# Railway builds from the repo root (the service has no Root Directory set), so this
# Dockerfile lives at the root and builds backend/ explicitly.
# Local development still uses backend/Dockerfile via docker-compose.yml.
FROM node:20-alpine AS builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/uploads
EXPOSE 3000
CMD ["node", "dist/main"]
