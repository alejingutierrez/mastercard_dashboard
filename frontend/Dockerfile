FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Use npm ci for faster, more reliable installs
# --prefer-offline reduces network calls
# --no-audit skips security audit (can run separately)
RUN npm ci --prefer-offline --no-audit

# Copy application files
COPY . .

ENV HOST=0.0.0.0
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
