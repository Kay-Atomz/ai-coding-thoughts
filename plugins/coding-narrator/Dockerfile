FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY web ./web
USER node
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["node", "src/http-server.mjs"]
