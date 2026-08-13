FROM node:20-bookworm-slim AS client
WORKDIR /app
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci
COPY client ./client
RUN cd client && npm run build

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server ./server
COPY --from=client /app/client/dist ./client/dist
COPY server/data/assets/case-bank-generated ./seed/case-bank
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/src/start-prod.js"]
