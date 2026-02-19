import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const externalPackages = [
      '@google/genai',
      '@supabase/supabase-js',
      'react',
      'react-dom',
      'lucide-react',
      'yaml',
      'ajv',
    ];
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      build: {
        rollupOptions: {
          external: (id) => {
            return externalPackages.some((pkg) => id === pkg || id.startsWith(`${pkg}/`));
          }
        }
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@ashim/engine': path.resolve(__dirname, 'packages/engine/src/index.ts'),
        }
      }
    };
});
