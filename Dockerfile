FROM node:20-alpine

WORKDIR /app

# Install production deps first for better layer caching.
# Uses the lockfile (npm ci) when present, else falls back to npm install.
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# App source.
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
