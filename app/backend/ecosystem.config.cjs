module.exports = {
  apps: [
    {
      name: 'medicai',
      cwd: __dirname,
      script: 'dist/main.js',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      autorestart: true,
      // En un servidor con 2 GB RAM, reiniciar antes de que el RSS total
      // supere ~380 MB deja margen para PostgreSQL y el SO.
      max_memory_restart: '384M',
      min_uptime: '10s',
      max_restarts: 5,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 30000,
      // --max-old-space-size controla el heap de V8. Con 448 MB y un RSS
      // reiniciado a 384 MB, el proceso se mantiene dentro del presupuesto.
      // --optimize-for-size y --gc-interval ayudan a reducir picos de memoria.
      node_args:
        '--max-old-space-size=448 --optimize-for-size --gc-interval=100',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        // 'warn' reduce I/O de logs en eMMC. Usa 'info' solo para depurar.
        LOG_LEVEL: 'warn',
        LOG_FORMAT: 'json',
        LOG_STACKS: 'false',
      },
      // Rotación agresiva de logs para no saturar los 16 GB de eMMC.
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      combine_logs: true,
      merge_logs: true,
      log_type: 'json',
      max_size: '10M',
      rotateInterval: '0 0 * * *',
    },
  ],
};
