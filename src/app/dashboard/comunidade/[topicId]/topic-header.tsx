'use client';

import { useComunidadeChromeActions } from '../navigation-guard';
import { SaveTopicButton } from '../save-topic-button';

// Restruturação do header do tópico (08/09/2026) — correção do bug de
// composição reportado após o primeiro fix (só padding, rejeitado por
// não formar um bloco de 3 áreas de verdade). Antes, ←/✕ vinham em
// `position: absolute` de @modal/(.)comunidade/layout.tsx, soltos da
// respiração do conteúdo — daí terem colidido com o breadcrumb/título
// mesmo depois de aumentar o padding: o problema nunca foi a
// quantidade de espaço, era ←/título/✕ não pertencerem ao mesmo fluxo.
//
// Aqui os três — voltar / breadcrumb+título / favoritar+fechar — vivem
// na MESMA row flex, então nunca há como um flutuar sobre o outro:
// crescer/encolher a viewport redistribui a row, não sobrepõe. voltar
// e fechar chamam useComunidadeChromeActions (navigation-guard.tsx),
// que só devolve as funções quando este componente está de fato dentro
// do ComunidadeGuardProvider do slide-over — a mesma lógica de
// guarda/profundidade/diálogo de descarte do layout, nunca duplicada
// aqui, só invocada.
//
// A rota cheia standalone (comunidade/[topicId]/page.tsx acessada
// direto, fora do slide-over) não tem Provider — useComunidadeChromeActions
// devolve null e este componente não desenha ←/✕ (nunca teve: não há
// "voltar" nem "fechar" fora de um painel sobreposto), preservando
// exatamente o comportamento standalone de sempre.
export function TopicHeader({
  title,
  categoryLabel,
  topicId,
  isSaved,
}: {
  title: string;
  categoryLabel: string | null;
  topicId: string;
  isSaved: boolean;
}) {
  const nav = useComunidadeChromeActions();

  return (
    <header className="border-b border-[var(--pro-line)] pb-4">
      <div className="flex items-center gap-3">
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
          <p className="font-doopla-mono text-[10px] uppercase tracking-[.08em] text-[var(--pro-tx-30)]">
            Comunidade{categoryLabel ? ` · ${categoryLabel}` : ''}
          </p>
          <h1 className="mt-1.5 font-pro-sub text-[19px] font-bold leading-snug text-[var(--pro-off)]">{title}</h1>
        </div>
        <div className="flex flex-none items-center gap-2">
          <SaveTopicButton
            topicId={topicId}
            initialSaved={isSaved}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--pro-tx-30)] hover:text-[var(--pro-red)]"
          />
          {nav && (
            <button
              type="button"
              onClick={nav.close}
              aria-label="Fechar"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
