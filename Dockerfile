FROM node:20-alpine

# Install build dependencies for Baileys
RUN apk add --no-cache git python3 make g++

WORKDIR /app

COPY package.json ./

# Install dependencies ignoring lockfile to prevent any build issues
RUN npm install --no-package-lock --omit=dev

COPY whatsapp-gateway.js ./

EXPOSE 7860
ENV PORT=7860

CMD ["node", "whatsapp-gateway.js"]
