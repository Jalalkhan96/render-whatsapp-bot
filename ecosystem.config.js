export default {
  apps: [
    {
      name: 'whatsapp-ai-bot',
      script: './src/index.js',
      interpreter: 'node',
      cwd: '.',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      restart_delay: 3000,
      min_uptime: '10s',
      max_restarts: 20,
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
