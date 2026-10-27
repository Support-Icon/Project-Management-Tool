# Lambda container image for the Express API.
# The Web Adapter binary is copied in by CI (scripts/fetch_lambda_adapter.sh).
FROM node:20-bookworm-slim

COPY .docker-cache/lambda-adapter /opt/extensions/lambda-adapter
RUN chmod 755 /opt/extensions/lambda-adapter

WORKDIR /var/task

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./

ENV NODE_ENV=production
ENV PORT=8080
ENV AWS_LWA_PORT=8080
ENV AWS_LWA_READINESS_CHECK_PATH=/

EXPOSE 8080
CMD ["node", "server.js"]
