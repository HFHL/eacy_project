ARG NODE_IMAGE=docker.m.daocloud.io/library/node:20-alpine
ARG NGINX_IMAGE=docker.m.daocloud.io/library/nginx:1.27-alpine

FROM ${NODE_IMAGE} AS build

ARG NPM_REGISTRY=https://registry.npmmirror.com

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend_new/package.json frontend_new/package.json
RUN npm config set registry "${NPM_REGISTRY}" \
    && npm ci

COPY frontend_new ./frontend_new
RUN npm run build -w xidong-crf-prototype-new

FROM ${NGINX_IMAGE} AS runtime

COPY deploy/docker/nginx/eacy.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend_new/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
