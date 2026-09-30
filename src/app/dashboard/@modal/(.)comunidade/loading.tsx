// Loading boundary da Comunidade (30/09/2026, achado real de QA: "quero
// que seja instantâneo como abrir um modal" — o painel só deslizava pra
// tela DEPOIS que os 3 round-trips sequenciais de comunidade/page.tsx
// terminavam, então o clique parecia travado por ~4s em vez de abrir na
// hora). Sem este arquivo, o Next não mostra nada até o Server Component
// inteiro (page.tsx) resolver — com isso, ele mostra o painel (aside,
// backdrop, botões ←/✕, tudo isso já é o layout.tsx, fora desta
// fronteira) IMEDIATAMENTE, com este spinner no lugar do conteúdo
// enquanto os dados ainda chegam. Mesmo padrão visual já validado em
// produção pro loading boundary do próprio /dashboard (ver
// src/app/dashboard/loading.tsx e o comentário lá sobre o "white flash"
// já corrigido) — currentColor herda a cor certa do painel escuro,
// nenhum fundo sólido que force um flash.
export default function ComunidadeLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-current/15 border-t-current/60" />
    </div>
  );
}
