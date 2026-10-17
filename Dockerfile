# Etapa 1: Build de Client y Server
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias globales y del monorepo
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
COPY server/prisma ./server/prisma

RUN npm install

# Copiar código fuente
COPY server ./server
COPY client ./client

# Compilar frontend y backend
RUN npm run prisma:generate --workspace=server
RUN npm run build --workspace=client
RUN npm run build --workspace=server

# Etapa 2: Runner de Producción
FROM node:20-alpine AS runner

WORKDIR /app

# Instalar ffmpeg para ensamblado de flujos HLS (.m3u8)
RUN apk add --no-cache ffmpeg

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

COPY package*.json ./
COPY server/package*.json ./server/
COPY server/prisma ./server/prisma

# Instalar solo dependencias de producción
RUN npm install --omit=dev

# Copiar builds generados
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Crear directorio de datos
RUN mkdir -p /app/data/downloads

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy --schema=./server/prisma/schema.prisma && node server/dist/index.js"]
