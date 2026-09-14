// Loading boundary do segmento /dashboard. Achado real (review
// 04/09/2026 — "white flash"): este arquivo só substitui o slot
// `{children}` (o conteúdo da página) — o Shell (sidebar/topbar, dark
// ou legado) é `layout.tsx`, que fica FORA dessa fronteira de Suspense
// e nunca desmonta entre navegações do mesmo segmento. A versão
// anterior pintava um retângulo `min-h-screen` sólido em
// `var(--paper)` (bege) DENTRO da área de conteúdo — como a maior
// parte da tela visível é essa área (a sidebar tem só 250px), isso lia
// como "a tela inteira ficou branca/em branco" pro usuário do Shell
// novo (dark), mesmo a sidebar nunca tendo desmontado de verdade.
// Fix: fundo transparente (deixa o fundo do Shell já pintado por trás
// aparecer, dark ou bege) + `currentColor` no spinner (herda a cor de
// texto certa de qualquer um dos dois shells, nunca hardcoded) + sem
// `min-h-screen` (não força um bloco vazio do tamanho da viewport).
export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-current/15 border-t-current/60" />
    </div>
  );
}
