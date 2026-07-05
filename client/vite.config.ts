import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@hugeicons/core-free-icons': fileURLToPath(
        new URL('node_modules/@hugeicons/core-free-icons/dist/esm/index.js', import.meta.url),
      ),
    },
  },
});
