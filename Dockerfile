FROM node:18-slim

# Install chrome dependencies for Puppeteer (required by whatsapp-web.js)
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
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
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

CMD ["npm", "start"]
