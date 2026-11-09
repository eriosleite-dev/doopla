// Fonte do e-mail de suporte no Mobile — auditoria de Ajuda e suporte
// (15/09/2026) confirmou que Web (src/lib/support.ts) e Mobile são
// pacotes separados (sem workspace/monorepo, tsconfigs e node_modules
// próprios — `@/*` do Mobile resolve só dentro de mobile/src) sem
// caminho de import limpo entre os dois. Duplicar esta única
// constante é a solução mínima apropriada aqui — nunca criar um
// pacote/workspace compartilhado só por causa disso. Registrado como
// debt de centralização: se um dia existir um pacote compartilhado
// Web/Mobile por outro motivo real, mover esta constante pra lá.
export const SUPPORT_EMAIL = 'contato@doopla.pro';
