FROM node:22-slim AS build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src/ ./src/
COPY server/migrations/ ./migrations/
COPY public/ /app/public/
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY --from=build --chown=node:node /app/server/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/dist ./dist
COPY --from=build --chown=node:node /app/server/migrations ./migrations
COPY --from=build --chown=node:node /app/public /app/public
USER node
EXPOSE 8080
CMD ["node","dist/index.js"]
