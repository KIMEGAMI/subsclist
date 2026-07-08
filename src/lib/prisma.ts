import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

type PrismaMariaDbConfig = Exclude<ConstructorParameters<typeof PrismaMariaDb>[0], string>;

function databaseConfig() {
  const url = new URL(env.databaseUrl);
  const [user, password = ""] = url.username
    ? [decodeURIComponent(url.username), decodeURIComponent(url.password)]
    : ["", ""];

  const config: PrismaMariaDbConfig = {
    host: url.hostname,
    port: Number(url.port || "3306"),
    user,
    password,
    database: url.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
  };

  const allowPublicKeyRetrieval = url.searchParams.get("allowPublicKeyRetrieval");
  if (allowPublicKeyRetrieval) {
    config.allowPublicKeyRetrieval = allowPublicKeyRetrieval === "true";
  }

  const cachingRsaPublicKey = url.searchParams.get("cachingRsaPublicKey");
  if (cachingRsaPublicKey) {
    config.cachingRsaPublicKey = cachingRsaPublicKey;
  }

  return config;
}

const adapter = new PrismaMariaDb(databaseConfig());

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
