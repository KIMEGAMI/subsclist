const appDir = process.env.APP_DIR || __dirname;
const appName = process.env.APP_NAME || "subsclist";
const appPort = process.env.APP_PORT || "3000";

module.exports = {
  apps: [
    {
      name: appName,
      cwd: appDir,
      script: "node_modules/next/dist/bin/next",
      args: ["start", "-p", appPort],
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: "production",
        PORT: appPort,
      },
    },
  ],
};