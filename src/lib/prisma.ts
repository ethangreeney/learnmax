import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // log: ['query'], // enable for debugging
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Centralized options for interactive transactions. Defaults to 10s, configurable via env.
const DEFAULT_TX_MS = parseInt(process.env.PRISMA_TX_TIMEOUT_MS || '10000', 10);
const DEFAULT_TX_MAX_WAIT_MS = parseInt(
  process.env.PRISMA_TX_MAX_WAIT_MS || String(DEFAULT_TX_MS),
  10
);

// Minimal shape accepted by prisma.$transaction callback overload
type TransactionOptionsLite = { timeout?: number; maxWait?: number };

export const INTERACTIVE_TX_OPTIONS: TransactionOptionsLite = {
  timeout: DEFAULT_TX_MS,
  maxWait: DEFAULT_TX_MAX_WAIT_MS,
};

export default prisma;
