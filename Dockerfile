FROM nikolaik/python-nodejs:python3.11-nodejs16-alpine
RUN apk add make zlib-dev gcc g++ musl-dev
WORKDIR /app
COPY . .
RUN yarn set version berry
RUN yarn install

CMD ["yarn", "turbo", "start"]
