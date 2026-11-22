FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run typecheck && npm run build && cp LICENSE dist/client/LICENSE

FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY src/server ./src/server
COPY src/sent-policy.ts src/reader-policy.ts src/reader-presentation.ts src/image-frame.ts ./src/
COPY scripts ./scripts
COPY tests/protocol-acceptance.ts ./tests/protocol-acceptance.ts
COPY LICENSE README.md THIRD_PARTY_NOTICES.txt .env.example ./
ENV NODE_ENV=production BIND_HOST=0.0.0.0
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["node", "scripts/health.mjs"]
CMD ["node", "src/server/main.ts"]
