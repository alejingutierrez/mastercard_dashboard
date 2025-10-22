FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY src ./src

ENV NODE_ENV=development
EXPOSE 4000

CMD ["npm", "run", "start"]
