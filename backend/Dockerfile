FROM node:20-alpine

WORKDIR /app

# Configure npm for faster installs
RUN npm config set fetch-retries 2 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000

# Install dependencies using npm ci (faster and more reliable)
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=development
EXPOSE 4000

CMD ["npm", "run", "start"]
