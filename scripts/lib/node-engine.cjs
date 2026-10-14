function parseVersion(value) {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function satisfiesNodeRange(version, range) {
  const current = parseVersion(version);
  if (!current || typeof range !== "string") return false;

  return range.split("||").some((part) => {
    const requirement = part.trim();
    const caret = /^\^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(requirement);
    if (caret) {
      const minimum = [Number(caret[1]), Number(caret[2]), Number(caret[3] ?? 0)];
      return current[0] === minimum[0] && compareVersions(current, minimum) >= 0;
    }

    const minimum = /^>=(\d+)\.(\d+)(?:\.(\d+))?$/.exec(requirement);
    if (minimum) {
      return compareVersions(current, [Number(minimum[1]), Number(minimum[2]), Number(minimum[3] ?? 0)]) >= 0;
    }

    return false;
  });
}

function requiredPrismaNodeRange(lockfile) {
  const packagePaths = ["node_modules/prisma", "node_modules/@prisma/client"];
  const ranges = packagePaths.map((packagePath) => lockfile.packages?.[packagePath]?.engines?.node);
  if (ranges.some((range) => typeof range !== "string" || !range.trim())) {
    throw new Error("Prisma Node.js engine requirements are missing from package-lock.json.");
  }
  if (!ranges.every((range) => range === ranges[0])) {
    throw new Error("Prisma packages have inconsistent Node.js engine requirements.");
  }
  return ranges[0];
}

module.exports = { requiredPrismaNodeRange, satisfiesNodeRange };
