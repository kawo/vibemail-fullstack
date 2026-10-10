import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Port 3001 matches the engine's default FRONTEND_URL (.env.example), its only allowed CORS origin.
export default defineConfig({
  plugins: [react()],
  server: { port: 3001, strictPort: true },
  preview: { port: 3001, strictPort: true },
});
