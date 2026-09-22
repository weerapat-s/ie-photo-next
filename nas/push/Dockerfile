# ตัวส่ง Web Push (ดู server.mjs) — Node ตัวเล็ก ติดตั้งแค่ web-push
FROM node:20-alpine
WORKDIR /app
RUN npm init -y >/dev/null && npm install --omit=dev web-push@3.6.7 >/dev/null
COPY server.mjs .
USER node
CMD ["node", "server.mjs"]
