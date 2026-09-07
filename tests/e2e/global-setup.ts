import { seedE2eUsers } from "./database";

export default async function globalSetup() {
  await seedE2eUsers();
}
