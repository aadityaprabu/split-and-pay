FROM node:26-alpine

WORKDIR /app

COPY app/package*.json ./
RUN npm ci --omit=dev

COPY app/ .

ENV NODE_ENV=production
USER node

CMD ["node", "src/server.js"]
