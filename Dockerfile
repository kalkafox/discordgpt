FROM nikolaik/python-nodejs:python3.11-nodejs16-alpine
RUN npm install -g turbo
RUN apk add make zlib-dev gcc g++ musl-dev
WORKDIR /app
COPY . .

RUN yarn set version berry && yarn install

RUN chmod +x docker-entrypoint.sh

CMD ["./docker-entrypoint.sh"]
