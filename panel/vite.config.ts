// Configuración del panel.
//
// `root` es esta carpeta y no la raíz del repositorio: el panel es una
// aplicación aparte que lee la proyección, no una vista del perímetro. Que Vite
// no pueda ver `src/` por omisión es una barrera más, además del lint y del
// check de arquitectura.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173 },
});
