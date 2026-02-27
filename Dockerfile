# KOLBR - Node.js backend + frontend estático
# Evita railpack-frontend (ghcr.io) que pode falhar por rede
FROM node:20-alpine

WORKDIR /app

# Copiar package files
COPY package.json ./
COPY backend/package.json backend/

# Instalar (postinstall faz cd backend && npm install)
RUN npm install --omit=dev

# Copiar código
COPY backend/ backend/
COPY frontend/ frontend/
COPY data/ data/

# Porta
ENV PORT=3001
EXPOSE 3001

CMD ["node", "backend/server.js"]
