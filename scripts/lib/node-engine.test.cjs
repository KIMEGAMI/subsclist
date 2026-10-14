/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const { requiredPrismaNodeRange, satisfiesNodeRange } = require("./node-engine.cjs");

const prismaRange = "^20.19 || ^22.12 || >=24.0";

test("Prisma Node.js engine accepts the supported major/minor ranges", () => {
  for (const version of ["20.19.0", "20.20.1", "22.12.0", "22.18.0", "24.0.0", "25.1.0"]) {
    assert.equal(satisfiesNodeRange(version, prismaRange), true, version);
  }
});

test("Prisma Node.js engine rejects unsupported minors and major versions", () => {
  for (const version of ["20.9.0", "20.18.9", "21.7.0", "22.11.9", "23.0.0", "v24", "unknown"]) {
    assert.equal(satisfiesNodeRange(version, prismaRange), false, version);
  }
});

test("Node.js requirement is read from the locked Prisma packages", () => {
  const lockfile = {
    packages: {
      "node_modules/prisma": { engines: { node: prismaRange } },
      "node_modules/@prisma/client": { engines: { node: prismaRange } },
    },
  };
  assert.equal(requiredPrismaNodeRange(lockfile), prismaRange);
  lockfile.packages["node_modules/@prisma/client"].engines.node = ">=24.0";
  assert.throws(() => requiredPrismaNodeRange(lockfile), /inconsistent/);
});
