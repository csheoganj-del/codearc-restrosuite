FROM node:20-slim

# Install Chromium and necessary system dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create home directory and app directory with user 1000 ownership
RUN mkdir -p /home/user && chown -R 1000:1000 /home/user
RUN mkdir -p /app && chown -R 1000:1000 /app

WORKDIR /app

USER 1000

COPY --chown=1000:1000 package*.json ./
RUN npm install

COPY --chown=1000:1000 . .

EXPOSE 7860

ENV PORT=7860
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

CMD ["npm", "start"]
