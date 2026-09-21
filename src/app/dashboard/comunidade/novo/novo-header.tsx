'use client';

import { useComunidadeChromeActions } from '../navigation-guard';

// QA visual (16/09/2026) — "Criar tópico" herdava os botões ←/✕ do
// slide-over em `position: absolute` (@modal/(.)comunidade/layout.tsx),
// soltos da respiração do conteúdo — o título (ProPageHeader) começava
// no mesmo canto onde o ← flutuava, sobrepondo os dois. É a MESMA causa
// raiz já corrigida pro header do tópico em 08/09/2026 (ver comentário
// em [topicId]/topic-header.tsx): o problema nunca foi a quantidade de
// espaço/padding, era ←/título/✕ não pertencerem ao mesmo fluxo. Esta é
// a mesma correção estrutural — voltar / título+subtítulo / fechar na
// MESMA row flex, reaproveitando useComunidadeChromeActions (mesmo
// guard de rascunho/profundidade/diálogo de descarte de sempre, nada
// duplicado aqui, só invocado). Fora do slide-over (rota cheia
// standalone, sem Provider), `nav` vem `null` e nenhum botão é
// desenhado — mesmo comportamento que TopicHeader já usa pra esse caso.
export function NovoTopicoHeader() {
  const nav = useComunidadeChromeActions();

  return (
    <header className="mb-5">
      <div className="flex items-start gap-3">
        {nav && (
          <button
            type="button"
            onClick={nav.back}
            aria-label="Voltar"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
          >
            ←
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-pro-sub text-[24px] font-bold sm:text-[26px]">Criar tópico</h1>
          <p className="mt-1.5 max-w-[440px] text-[13.5px] text-[var(--pro-tx-70)]">
            Pergunte, compartilhe ou peça conselho pra outros profissionais da Doopla.
          </p>
        </div>
        {nav && (
          <button
            type="button"
            onClick={nav.close}
            aria-label="Fechar"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
          >
            ✕
          </button>
        )}
      </div>
    </header>
  );
}
