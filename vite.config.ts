import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// Force rebuild
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? './' : '/', // Use relative path for build (GitHub Pages), absolute for dev
}));
