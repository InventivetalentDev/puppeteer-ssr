FROM zenika/alpine-chrome:with-node

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD 1
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium-browser
ENV GOOGLE_CHROME_BIN /usr/bin/chromium-browser
WORKDIR /usr/src/app

COPY --chown=chrome package.json package-lock.json ./
RUN npm install

COPY --chown=chrome . ./
RUN npm run build

EXPOSE 8080

CMD ["node", "."]
