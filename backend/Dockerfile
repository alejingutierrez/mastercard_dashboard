FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Use npm ci for faster, more reliable installs
# --prefer-offline reduces network calls
# --no-audit skips security audit (can run separately)
# --omit=dev for production, but keeping dev for development mode
RUN npm ci --prefer-offline --no-audit

# Copy application files
COPY src ./src

ENV NODE_ENV=development
EXPOSE 4000

CMD ["npm", "run", "start"]
