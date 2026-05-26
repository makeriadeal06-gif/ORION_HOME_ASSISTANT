import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client'),
      '@modules': path.resolve(__dirname, './modules'),
      '@shared': path.resolve(__dirname, './shared'),
      '@ui': path.resolve(__dirname, './ui'),
      '@lib': path.resolve(__dirname, './client/lib'),
      '@client': path.resolve(__dirname, './client'),
      '@core': path.resolve(__dirname, './client/core'),
    },
  },
  server: {
    port: 3000,
    hmr: false,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor libraries - Large ones isolated
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'vendor-charts';
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('framer-motion')) return 'vendor-ui-motion';
            
            // Group all other vendor libs into a single core-vendor chunk to avoid circularity
            return 'vendor-core';
          }

          // Shared Runtime Core (to avoid dynamic import warnings and optimize sharing)
          if (id.includes('client/core/')) {
            if (
              id.includes('useSystemStore') || 
              id.includes('MqttManager') || 
              id.includes('AuthManager') || 
              id.includes('CognitiveEventBus') || 
              id.includes('AutomationStore') ||
              id.includes('ProductionRecoveryEngine') ||
              id.includes('Logger')
            ) {
              return 'runtime-shared';
            }
          }

          // UI Components and Icons (if not from lucide-react)
          if (id.includes('ui/') || id.includes('lucide-react')) {
            return 'vendor-ui-icons';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1200,
    reportCompressedSize: false,
    cssCodeSplit: true,
    sourcemap: false,
  },
});
