
FROM node:24-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       git \
       ca-certificates \
       ffmpeg \
       python3 \
       python3-pip \
       make \
       g++ \
       libfontconfig1 \
       libfreetype6 \
    && rm -rf /var/lib/apt/lists/* \
    && git config --global \
       url."https://github.com/".insteadOf "ssh://git@github.com/" \
    && git config --global --add \
       url."https://github.com/".insteadOf "git@github.com:"

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force


FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    SESSION_DIR=/var/data/session \
    PERSISTENT_DATA_DIR=/var/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       git \
       ca-certificates \
       ffmpeg \
       python3 \
       python3-pip \
       libfontconfig1 \
       libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules

COPY . .

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

EXPOSE 10000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

CMD ["npm", "start"]
