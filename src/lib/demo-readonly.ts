const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const allowedPaths = new Set([
  "/api/auth/demo-login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/contact",
]);

export function shouldBlockDemoMutation(method: string, pathname: string) {
  return mutationMethods.has(method.toUpperCase()) && !allowedPaths.has(pathname);
}
