import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { existsSync } from 'fs';
import animeRoutes from './routes/animeRoutes.js';
import streamRoutes from './routes/streamRoutes.js';
import downloadRoutes from './routes/downloadRoutes.js';
import storageRoutes from './routes/storageRoutes.js';
import schedulerService from './services/scheduler.js';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

import logger, { syncLogSymlinks } from './utils/logger.js';

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Range', 'Authorization'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  })
);

app.use(express.json());

// Logger estructurado para peticiones HTTP
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.path.includes('/progress')) {
    logger.info({ method: req.method, path: req.path }, `[HTTP] ${req.method} ${req.path}`);
  }
  next();
});

// Rutas de la API
app.use('/api/anime', animeRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/downloads', downloadRoutes);
app.use('/api/storage', storageRoutes);

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Servir frontend compilado en producción si existe
const client_dist_path = path.resolve(process.cwd(), 'client/dist');
if (existsSync(client_dist_path)) {
  app.use(express.static(client_dist_path));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(client_dist_path, 'index.html'));
  });
}

// Manejador global de errores
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, '[Unhandled Error]');
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    logger.info(`🚀 Servidor Gaiame escuchando en http://localhost:${port}`);
    logger.info(`📡 Base de datos conectada en ${process.env.DATABASE_URL?.split('@')[1] || 'localhost:5432'}`);
    schedulerService.init();
    syncLogSymlinks();
  });
}

export default app;
