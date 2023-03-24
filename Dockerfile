FROM nikolaik/python-nodejs:python3.11-nodejs16-alpine
RUN npm install -g turbo
RUN apk add make zlib-dev gcc g++ musl-dev
WORKDIR /app
COPY . .

CMD ["./docker-entrypoint.sh"]
