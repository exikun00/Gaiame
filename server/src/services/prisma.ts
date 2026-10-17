import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma_singleton_instance: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.prisma_singleton_instance ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma_singleton_instance = prisma;
}

export default prisma;
