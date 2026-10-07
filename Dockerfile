FROM node:24-bookworm-slim AS build
WORKDIR /workspace
RUN npm install -g pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json ./api/package.json
COPY web/package.json ./web/package.json
RUN pnpm install --frozen-lockfile
COPY api ./api
COPY web ./web
RUN pnpm build
RUN pnpm --filter @carequeue/api deploy --prod --legacy /out/api

FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/api ./
USER node
CMD ["node","dist/src/entrypoints/api.js"]

FROM nginx:stable-alpine AS frontend
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/web/dist /usr/share/nginx/html
EXPOSE 8080
