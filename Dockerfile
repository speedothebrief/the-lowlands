# The Lowlands — LAN game server (serves index.html + WebSocket /ws on one port)
FROM node:20-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY index.html server.js ./
RUN chown -R node:node /app
USER node
EXPOSE 8080 3478/udp
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
CMD ["node", "server.js"]
