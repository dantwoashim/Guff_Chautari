import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {              if (id.includes('@supabase')) return 'supabase-vendor';
              if (id.includes('@google/genai')) return 'genai-vendor';
              if (id.includes('lucide-react')) return 'icons-vendor';
              return 'vendor';
            }

            if (id.includes('/components/admin/')) return 'admin-surface';
            if (id.includes('/components/VoiceLab')) return 'voice-surface';
            if (id.includes('/components/MemoryPalace')) return 'memory-surface';
            if (id.includes('/components/OracleDashboard')) return 'oracle-surface';
            if (id.includes('/components/DreamGallery')) return 'dream-surface';
            if (id.includes('/components/CognitiveDNAPanel')) return 'dna-surface';
            if (id.includes('/components/SystemVerification')) return 'verification-surface';
            if (id.includes('/components/VideoContinuum')) return 'video-surface';
            if (id.includes('/components/BranchNavigator')) return 'branch-surface';
            return undefined;
          },
        },
      },
    },
  };
});
