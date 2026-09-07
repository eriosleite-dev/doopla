'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Comunidade volta a ser painel lateral no Web (07/09/2026) — a UX
// original aprovada (protótipo do bloco Shell+Home, "slide da direita,
// backdrop") tinha sido substituída por página inteira na Fase 1 por
// escolha técnica minha, nunca uma decisão de produto revisitada (ver
// PROGRESS.md/DECISOES.md). Esta é a correção: mesmas rotas
// (`/dashboard/comunidade/*`), mesmos dados/Server Actions da Fase 1,
// zero lógica duplicada — só o container muda de `<main>` full-bleed
// pra este painel deslizante, via intercepting route (mesmo mecanismo
// já usado em @modal/(.)bookings, (.)artistas, (.)bookers, (.)conversas).
//
// Largura variável (item 4, opção (a) aprovada): compacto pra
// busca/Recentes/Salvos/Criar tópico, mais largo só ao entrar num
// tópico — o MESMO painel (nunca um segundo modal por cima). Como este
// layout.tsx é compartilhado por todas as rotas internas da Comunidade
// (`page`, `[topicId]`, `novo`, `salvos`), ele nunca desmonta entre
// essas navegações — só a largura (`transition-[width]`) anima, sem
// pulo de layout. A decisão de largura é por pathname (não por prop
// dedicada) porque um único layout.tsx compartilhado não recebe o
// parâmetro dinâmico das rotas irmãs.
//
// Fechar (X, Escape, clique fora) usa router.back() — mesmo padrão do
// ProfileModal (bookings/artistas/bookers) — porque a rota interceptada
// foi empilhada via navegação client-side; back() volta pro dashboard
// exatamente onde estava, sem reload.
export default function ComunidadeModalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [entered, setEntered] = useState(false);

  const isTopicDetail = /^\/dashboard\/comunidade\/(?!novo$|salvos$)[^/]+$/.test(pathname);

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
          className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${entered ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => router.back()}
          aria-hidden="true"
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Comunidade"
          className={`fixed top-0 right-0 h-screen max-w-[92vw] overflow-y-auto border-l border-[var(--pro-line)] bg-[var(--pro-panel-solid)] text-[var(--pro-off)] shadow-[-24px_0_60px_rgba(0,0,0,.4)] transition-[width,transform] duration-300 ease-out ${
            entered ? 'translate-x-0' : 'translate-x-full'
          } ${isTopicDetail ? 'w-[760px]' : 'w-[460px]'}`}
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
