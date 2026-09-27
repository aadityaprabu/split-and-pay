# Build stage
FROM node:26-alpine AS build

WORKDIR /app

# Compose passes these from the root .env; Vite only reads VITE_* variables
ARG BACKEND_URL
ARG FRONTEND_BASE_URL

ENV VITE_BACKEND_URL=$BACKEND_URL
ENV VITE_BASE_URL=$FRONTEND_BASE_URL

# Yarn itself comes from the repo (.yarn/releases, pinned by .yarnrc.yml): the image has no yarn of its own
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
RUN node .yarn/releases/yarn-*.cjs install --immutable

COPY . .
RUN node .yarn/releases/yarn-*.cjs build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

RUN rm /etc/nginx/conf.d/default.conf
# Rendered to /etc/nginx/conf.d/default.conf at container start, using FRONTEND_PORT,
# BACKEND_URL and BACKEND_PORT from the container environment
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/snippets/

CMD ["nginx", "-g", "daemon off;"]
