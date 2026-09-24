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
      // Con 6 GB RAM, hay margen para un heap mayor sin competir con PostgreSQL.
      max_memory_restart: '1536M',
      min_uptime: '10s',
      max_restarts: 5,
      // Retraso creciente entre reinicios para no saturar CPU/eMMC en bucle.
      exp_backoff_restart_delay: 1000,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 30000,
      // Heap de V8 de hasta 1 GB. Sin --optimize-for-size ni --gc-interval
      // forzado: con 6 GB priorizamos velocidad (menor latencia bajo carga).
      node_args: '--max-old-space-size=1024',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        // 'info' muestra también las requests completadas (además de warn/error).
        LOG_LEVEL: 'info',
        LOG_FORMAT: 'pretty',
        LOG_STACKS: 'false',
      },
      // Rotación agresiva de logs para no saturar el almacenamiento eMMC.
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
