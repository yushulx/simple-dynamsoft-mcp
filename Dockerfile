FROM node:24-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts
COPY data/metadata ./data/metadata
COPY README.md .env.example ./

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 80

CMD ["node", "src/index.js", "--transport=http", "--host=0.0.0.0", "--port=80"]
