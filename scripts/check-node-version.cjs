/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { requiredPrismaNodeRange, satisfiesNodeRange } = require("./lib/node-engine.cjs");

function main() {
  const lockfile = JSON.parse(fs.readFileSync(path.join(__dirname, "../package-lock.json"), "utf8"));
  const requiredRange = requiredPrismaNodeRange(lockfile);
  if (!satisfiesNodeRange(process.versions.node, requiredRange)) {
    console.error(`Unsupported Node.js ${process.versions.node}; Prisma requires ${requiredRange}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Node.js ${process.versions.node} satisfies Prisma's ${requiredRange} requirement.`);
}

if (require.main === module) main();
