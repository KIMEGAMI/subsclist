import { cleanupE2eUsers } from "./database";

export default async function globalTeardown() {
  await cleanupE2eUsers();
}
