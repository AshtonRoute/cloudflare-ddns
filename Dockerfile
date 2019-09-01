# syntax = docker/dockerfile:experimental
FROM node:12.9.1-alpine

WORKDIR /app

RUN yarn config set save-exact
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
  yarn global add npm-check-updates

COPY package.json yarn.lock /app/
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
  yarn install

COPY src /app/src

ENV NODE_ENV production

CMD ["node", "/app/src"]
