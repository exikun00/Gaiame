import pino from 'pino';
import fs from 'fs';
import path from 'path';

// Asegurar existencia del directorio de logs consistente en server/logs
const log_dir = fs.existsSync(path.resolve(process.cwd(), 'server'))
  ? path.resolve(process.cwd(), 'server', 'logs')
  : path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(log_dir)) {
  fs.mkdirSync(log_dir, { recursive: true });
}

import { createRequire } from 'module';
const nodeRequire = createRequire(import.meta.url);
const pino_roll_path = nodeRequire.resolve('pino-roll');

// Transporte para el servidor general (server.log y errors.log)
const server_transport = pino.transport({
  targets: [
    {
      target: 'pino-pretty',
      level: process.env.LOG_LEVEL || 'info',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
    {
      target: pino_roll_path,
      level: process.env.LOG_LEVEL || 'info',
      options: {
        file: path.join(log_dir, 'server'),
        frequency: 'daily',
        dateFormat: 'yyyy-MM-dd',
        extension: '.log',
        mkdir: true,
        limit: {
          count: 7,
          removeOtherLogFiles: true,
        },
      },
    },
    {
      target: pino_roll_path,
      level: 'warn',
      options: {
        file: path.join(log_dir, 'errors'),
        frequency: 'daily',
        dateFormat: 'yyyy-MM-dd',
        extension: '.log',
        mkdir: true,
        limit: {
          count: 7,
          removeOtherLogFiles: true,
        },
      },
    },
  ],
});

// Transporte dedicado para eventos y acciones de usuarios (users.log)
const user_transport = pino.transport({
  targets: [
    {
      target: 'pino-pretty',
      level: 'info',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
    {
      target: pino_roll_path,
      level: 'info',
      options: {
        file: path.join(log_dir, 'users'),
        frequency: 'daily',
        dateFormat: 'yyyy-MM-dd',
        extension: '.log',
        mkdir: true,
        limit: {
          count: 7,
          removeOtherLogFiles: true,
        },
      },
    },
  ],
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  server_transport
);

export const userLogger = pino(
  {
    level: 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  user_transport
);

// Función utilitaria para sincronizar symlinks canónicos (server.log, errors.log, users.log)
export function syncLogSymlinks(): void {
  const prefixes = ['server', 'errors', 'users'];
  for (const prefix of prefixes) {
    try {
      const files = fs.readdirSync(log_dir)
        .filter((f) => f.startsWith(`${prefix}.20`) && f.endsWith('.log'))
        .sort();

      if (files.length > 0) {
        const latest_file = files[files.length - 1];
        const symlink_target = path.join(log_dir, `${prefix}.log`);

        try {
          fs.unlinkSync(symlink_target);
        } catch {
          // Si no existe previamente, continuar
        }
        if (latest_file) {
          fs.symlinkSync(latest_file, symlink_target);
        }
      }
    } catch {
      // Ignorar fallos menores de symlink en entornos restringidos
    }
  }
}

// Ejecutar sincronización inicial tras crear los transportes
setTimeout(syncLogSymlinks, 600);

export default logger;
