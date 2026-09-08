'use client';

import { useEffect } from 'react';

// Correção da investigação do "fundo preto" da Comunidade (08/09/2026)
// — este boundary não existia em lugar nenhum de /dashboard/*. Três
// reproduções isoladas e fiéis (mesmo Next.js 16.3.0, layout raiz
// assíncrono forçado dinâmico via cookies(), múltiplos awaits
// sequenciais imitando as chamadas reais, middleware, loading.tsx,
// prefetch do link da Comunidade, e o mecanismo completo de
// profundidade de history + fechar por X) preservaram `children`
// corretamente em soft navigation em todos os casos testados — não há
// indício de defeito no mecanismo de parallel/intercepting routes em
// si. A causa raiz real segue sem confirmação neste ambiente (sem
// credenciais pra reproduzir contra a aplicação de verdade). O X
// também ficando "preso" (relatado pelo usuário) é o dado mais forte:
// aponta pra um erro de runtime no client durante essa transição
// específica — em produção, sem este boundary, um erro assim falha em
// silêncio (tela preta, sem overlay de erro, roteador sem reagir mais).
// Este arquivo não conserta a causa (ainda desconhecida) — torna
// qualquer erro real VISÍVEL (mensagem + "Tentar de novo", contido só
// no slot children, sem derrubar sidebar/@modal) em vez de silencioso,
// o que é o próximo passo necessário pra identificar a causa exata.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[dashboard/error.tsx]', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-pro-sub text-[15px] font-bold text-[var(--pro-off,#fbf9f2)]">Algo deu errado nesta página.</p>
      <p className="max-w-[420px] text-[13px] text-[var(--pro-tx-50,rgba(251,249,242,.5))]">
        {error.message || 'Ocorreu um erro inesperado ao carregar este conteúdo.'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="font-pro-sub mt-1 rounded-full bg-[var(--pro-red,#e2291c)] px-5 py-2 text-[12.5px] font-bold text-white"
      >
        Tentar de novo
      </button>
    </div>
  );
}
