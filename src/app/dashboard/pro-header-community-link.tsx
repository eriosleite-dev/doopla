'use client';

import { useState } from 'react';
import Link from 'next/link';

// Mesmo bug do fundo preto da Comunidade (08/09/2026, ver pro-sidebar-nav.tsx
// ProNavItem) — este ícone do header (/dashboard/comunidade) nunca tinha
// recebido a mesma correção porque vive fora do sidebar, num componente
// Server (pro-shell.tsx) sem estado. Ele fica sempre visível/no viewport
// em toda página do dashboard, então o prefetch automático padrão do
// <Link> dispara sozinho a qualquer momento e pode colidir com a
// preservação do slot `children` na navegação interceptada da Comunidade,
// produzindo a mesma página em branco. Mesmo padrão já validado em
// produção: prefetch começa desligado e só é armado depois de um sinal
// real de intenção do usuário (hover ou toque).
export function ProHeaderCommunityLink() {
  const [hoverArmed, setHoverArmed] = useState(false);

  return (
    <Link
      href="/dashboard/comunidade"
      aria-label="Comunidade"
      prefetch={hoverArmed ? undefined : false}
      onMouseEnter={() => setHoverArmed(true)}
      onTouchStart={() => setHoverArmed(true)}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-70)] hover:text-[var(--pro-off)]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.6" />
        <path d="M2 20c1-3.5 3.5-5.5 7-5.5s6 2 7 5.5" />
        <path d="M14.5 14.6c2.7.4 4.3 2 5 5.4" />
      </svg>
    </Link>
  );
}
