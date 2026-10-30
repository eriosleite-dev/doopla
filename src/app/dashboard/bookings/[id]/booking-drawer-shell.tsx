'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// BookingDrawer (aprovado pela fundadora, 30/09/2026) — drawer lateral
// dedicado pro painel Profissional, dark (--pro-*), reaproveitando o
// padrão visual já validado em @modal/(.)comunidade/layout.tsx (slide
// da direita, backdrop, Escape/clique fora fecha). Deliberadamente
// SEM a máquina de profundidade/guard de rascunho daquele layout — o
// booking é um nível único (sem sub-navegação dentro do drawer), então
// não existe "Voltar" nem rascunho pra proteger aqui: só abrir/fechar.
// Fechar sempre usa router.back() (um passo real de history — a linha
// da lista empurrou exatamente uma entrada pra abrir o drawer).
export function BookingDrawerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') router.back();
    }
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [router]);

  return (
    <div className="pro-shell contents">
      <div className="fixed inset-0 z-[110]" role="presentation">
        <div
          className={`absolute inset-0 bg-black/25 transition-opacity duration-200 ${entered ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => router.back()}
          aria-hidden="true"
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Booking"
          className={`fixed top-0 right-0 h-screen w-[560px] max-w-[92vw] overflow-y-auto border-l border-[var(--pro-line)] bg-[var(--pro-panel-solid)] text-[var(--pro-off)] shadow-[-24px_0_60px_rgba(0,0,0,.4)] transition-transform duration-300 ease-out ${
            entered ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Fechar"
            className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
          >
            ✕
          </button>
          <div className="p-6">{children}</div>
        </aside>
      </div>
    </div>
  );
}
