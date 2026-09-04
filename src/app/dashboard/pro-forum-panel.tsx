'use client';

import { useState } from 'react';

// Entrada do Fórum/Community no novo Shell — só o affordance visual +
// abertura do painel lateral (mesma composição do protótipo aprovado:
// slide da direita, backdrop). NÃO busca/renderiza tópicos ou posts
// (isso é escopo do subbloco Community dedicado, que vai consumir
// src/lib/community/data.ts) — mostrar zero conteúdo fabricado é mais
// seguro do que simular. Sem forumMock.ts, sem badge de contagem (não
// há fato Community real barato o bastante pra esse badge ainda).
export function ProForumPanel() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir Fórum"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-70)] hover:text-[var(--pro-off)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.6" />
          <path d="M2 20c1-3.5 3.5-5.5 7-5.5s6 2 7 5.5" />
          <path d="M14.5 14.6c2.7.4 4.3 2 5 5.4" />
        </svg>
      </button>

      <div
        className={`fixed inset-0 z-[1200] bg-black/50 transition-opacity duration-200 ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`fixed top-0 right-0 z-[1201] flex h-screen w-[420px] max-w-[92vw] flex-col border-l border-[var(--pro-line)] bg-[var(--pro-panel-solid)] text-[var(--pro-off)] transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-none items-center gap-3 border-b border-[var(--pro-line)] p-5">
          <p className="font-pro-sub flex-1 text-[16px] font-bold">Fórum</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="font-doopla-mono text-[12px] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
          >
            Fechar ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <p className="font-pro-sub text-[15px] font-bold">A comunidade de profissionais Doopla está chegando.</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--pro-tx-50)]">
            Um espaço só de artistas pra trocar ideia, indicar trabalho e tirar dúvida com quem já passou pela mesma
            coisa — com privacidade sob seu controle. Estamos construindo essa tela com calma; quando estiver pronta
            de verdade, ela abre aqui.
          </p>
        </div>
      </aside>
    </>
  );
}
