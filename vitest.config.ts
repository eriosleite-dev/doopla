import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Doopla — suíte de testes automatizados de regressão (13/10/2026).
// Zero impacto em produção: config isolado, lido só pelo próprio
// Vitest (`npm test`), nunca pelo build/runtime do Next.js. Só cobre
// src/ — mobile/ tem seu próprio projeto/dependências, fora de escopo.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
