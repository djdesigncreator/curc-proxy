FROM node:20-alpine

LABEL org.opencontainers.image.source="https://github.com/djdesigncreator/curc-proxy"
LABEL org.opencontainers.image.description="Container proxy da plataforma EAD CURC"

WORKDIR /app
COPY package.json ./
COPY server.js ./
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
