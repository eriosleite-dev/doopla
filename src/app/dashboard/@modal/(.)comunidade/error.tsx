'use client';

import { useEffect } from 'react';

import { proPrimaryButtonClass } from '../../pro-format';

// Mesmo boundary de src/app/dashboard/comunidade/error.tsx, mas pro
// slot @modal (painel deslizante) — são duas árvores de rota
// diferentes (intercepting route), cada uma precisa do próprio
// error.tsx pra não deixar a Comunidade travar sem saída quando
// aberta como painel (navegação client-side normal, o caminho mais
// comum) em vez de página cheia (só em navegação direta/reload).
export default function ComunidadeModalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[comunidade/modal] erro ao carregar', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-pro-sub text-[16px] font-bold text-[var(--pro-off)]">Não conseguimos carregar a Comunidade agora.</p>
      <p className="max-w-xs text-[13px] text-[var(--pro-tx-50)]">
        Pode ser algo temporário. Tenta de novo — se continuar acontecendo, me avisa.
      </p>
      <button type="button" onClick={reset} className={proPrimaryButtonClass}>
        Tentar de novo
      </button>
      {/* Instrumentação temporária (16/09/2026) — ver nota em
          ../../comunidade/error.tsx. Remover quando a causa raiz for
          encontrada e corrigida. */}
      <div className="mt-2 max-w-xs rounded-[10px] border border-[var(--pro-line)] bg-black/30 px-3 py-2 text-left font-mono text-[11px] text-[var(--pro-tx-50)]">
        <p>mensagem: {error.message || '(vazia)'}</p>
        {error.digest && <p>digest: {error.digest}</p>}
      </div>
    </div>
  );
}
