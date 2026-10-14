import { isIP } from "node:net";

const localHostSuffixes = [".localhost", ".local", ".internal", ".test", ".invalid"];

export function isAllowedPublicHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");

    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && hostname.includes(".")
      && isIP(hostname) === 0
      && hostname !== "localhost"
      && !localHostSuffixes.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}
