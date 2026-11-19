import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: {
  cwd: () => string;
  env: Record<string, string | undefined>;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = parseInt(env.PORT || env.VITE_PORT || '5193', 10);
  const apiUrl = env.VITE_API_URL || 'http://localhost:5194';

  return {
    plugins: [react()],
    server: {
      port: port,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/events': {
          target: apiUrl,
          changeOrigin: true,
          timeout: 0,
        },
        '/graph.bin': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/healthz': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/save': {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
  };
});

