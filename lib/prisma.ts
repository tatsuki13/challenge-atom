import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prismaClient?: PrismaClient;
};

export function getPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return null;
  }

  globalForPrisma.prismaClient ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  return globalForPrisma.prismaClient;
}
