const APP_NAME = "subsclist";
const APP_DIR = process.env.SUBSCLIST_APP_DIR || "/var/www/subsclist";
const PORT = process.env.PORT || "3000";

module.exports = {
  apps: [
    {
      name: APP_NAME,
      cwd: APP_DIR,
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${PORT}`,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT,
      },
    },
  ],
};
