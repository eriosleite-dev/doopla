import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Achado real (Head of AI, 15/10/2026, ao montar o CI): mobile/ é
    // um projeto Expo/React Native totalmente separado (package.json/
    // package-lock.json/tsconfig.json próprios, doopla-mobile) —
    // nunca deveria ser varrido pelo eslint deste app Next.js. O
    // globalIgnores acima SOBRESCREVE os ignores padrão do
    // eslint-config-next (em vez de só adicionar a eles), então sem
    // esta linha `npm run lint`/`eslint` na raiz sempre incluía
    // mobile/ por acidente — 45+ erros pré-existentes e totalmente
    // fora de escopo apareciam em qualquer lint deste projeto.
    "mobile/**",
  ]),
]);

export default eslintConfig;
