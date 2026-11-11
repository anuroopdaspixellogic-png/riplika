# Build the client, then ship only the server, built assets and production deps.

FROM node:24-alpine AS build
WORKDIR /app

# Vite inlines VITE_* values at build time, so TURN settings are build args.
# Everything else is read at runtime from the environment.
ARG VITE_TURN_URL=""
ARG VITE_TURN_USERNAME=""
ARG VITE_TURN_CREDENTIAL=""
ENV VITE_TURN_URL=${VITE_TURN_URL} \
    VITE_TURN_USERNAME=${VITE_TURN_USERNAME} \
    VITE_TURN_CREDENTIAL=${VITE_TURN_CREDENTIAL}

COPY package.json package-lock.json ./
RUN npm ci

# .dockerignore keeps node_modules, dist, data and .env out of this context.
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    SQLITE_PATH=/app/data/riplika.sqlite

# Runtime TURN relay. The client fetches these from /api/config, so they can
# be changed by restarting the container without rebuilding the image.
ENV TURN_URL="" \
    TURN_USERNAME="" \
    TURN_CREDENTIAL=""

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 8787
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/api/health').then((r) => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "server/index.js"]
