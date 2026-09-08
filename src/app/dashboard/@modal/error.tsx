'use client';

import { useEffect } from 'react';

// Espelha dashboard/error.tsx — mesma instrumentação diagnóstica, só
// que escopada ao slot @modal (bookings/artistas/bookers/conversas/
// comunidade em overlay). Se o erro real da investigação do "fundo
// preto" estiver na renderização do slot interceptado em vez de em
// `children`, é este boundary (não o outro) que vai capturá-lo — cada
// slot precisa do próprio error.tsx, um não cobre o outro.
export default function ModalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[dashboard/@modal/error.tsx]', error);
  }, [error]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-[360px] rounded-[16px] border border-white/10 bg-[#161414] p-6 text-center text-[#fbf9f2] shadow-[0_20px_60px_rgba(0,0,0,.5)]">
        <p className="font-pro-sub text-[14px] font-bold">Não deu pra abrir isso agora.</p>
        <p className="mt-1.5 text-[12.5px] text-white/50">{error.message || 'Ocorreu um erro inesperado.'}</p>
        <button
          type="button"
          onClick={reset}
          className="font-pro-sub mt-4 rounded-full bg-[#e2291c] px-5 py-2 text-[12.5px] font-bold text-white"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
