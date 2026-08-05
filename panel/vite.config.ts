// Configuración del panel.
//
// `root` es esta carpeta y no la raíz del repositorio: el panel es una
// aplicación aparte que lee la proyección, no una vista del perímetro. Que Vite
// no pueda ver `src/` por omisión es una barrera más, además del lint y del
// check de arquitectura.

// `root` se resuelve desde este archivo y no desde el directorio de trabajo:
// las órdenes `panel` y `panel:construir` se lanzan desde la raíz del
// repositorio, y una ruta relativa haría que Vite sirviera el perímetro entero.

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173 },
});
