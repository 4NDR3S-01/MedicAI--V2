module.exports = {
  apps: [
    {
      name: 'medicai-backend',
      cwd: __dirname,
      script: 'dist/main.js',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      autorestart: true,
      max_memory_restart: '512M',
      min_uptime: '10s',
      max_restarts: 10,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        LOG_LEVEL: 'info',
      },
    },
  ],
};
