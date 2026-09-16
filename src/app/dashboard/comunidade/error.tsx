'use client';

import { useEffect } from 'react';

import { proPrimaryButtonClass } from '../pro-format';

// Nenhuma rota do app tinha error.tsx até aqui (auditado, 16/09/2026)
// — quando algo dentro de /dashboard/comunidade lança uma exceção não
// tratada, o profissional via uma tela genérica sem nenhuma saída
// visível (achado real reportado pela fundadora: "This page couldn't
// load", sem stack trace visível nem nos Runtime Logs). Este boundary
// não corrige a causa raiz do que estiver lançando o erro — só garante
// que a Comunidade falha de forma visível e recuperável (retry) em vez
// de uma tela em branco sem saída, e loga o digest no console pra
// facilitar diagnóstico futuro.
export default function ComunidadeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[comunidade] erro ao carregar', error);
  }, [error]);

  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-5 text-center">
      <p className="font-pro-sub text-[17px] font-bold text-[var(--pro-off)]">Não conseguimos carregar a Comunidade agora.</p>
      <p className="max-w-sm text-[13.5px] text-[var(--pro-tx-50)]">
        Pode ser algo temporário. Tenta de novo — se continuar acontecendo, me avisa.
      </p>
      <button type="button" onClick={reset} className={proPrimaryButtonClass}>
        Tentar de novo
      </button>
    </main>
  );
}
