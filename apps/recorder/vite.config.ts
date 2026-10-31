import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { fs: { strict: false } },
  build: { target: 'es2022' },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
} as never);
