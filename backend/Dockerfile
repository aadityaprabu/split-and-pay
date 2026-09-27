FROM node:26-alpine

WORKDIR /app

# Yarn itself comes from the repo (.yarn/releases, pinned by .yarnrc.yml): the image has no yarn of its own
COPY app/package.json app/yarn.lock app/.yarnrc.yml ./
COPY app/.yarn/releases ./.yarn/releases
# Production dependencies only; the lockfile must already match package.json.
# The download cache is only needed during the install, so it's dropped to keep the image small.
RUN node .yarn/releases/yarn-*.cjs workspaces focus --production \
  && node .yarn/releases/yarn-*.cjs cache clean --all

COPY app/ .

ENV NODE_ENV=production
USER node

CMD ["node", "src/server.js"]
