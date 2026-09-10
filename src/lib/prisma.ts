/**
 * Cliente Prisma como singleton.
 *
 * O hot reload do `next dev` reavalia modulos a cada mudanca; sem o cache no
 * `globalThis`, cada reload abriria uma nova pool de conexoes e o Postgres
 * derrubaria a aplicacao por excesso de conexoes.
 */

import { PrismaClient } from "@prisma/client";

const globalParaPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalParaPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalParaPrisma.prisma = prisma;
}
