'use client';

import { useEffect, useRef, useState } from 'react';

// Item 6 (08/09/2026, "Menu ••• + exclusão") — um único componente
// reutilizado pelo header do tópico (topic-header.tsx, exclui o
// tópico) e por cada mensagem própria (pro-comunidade-topic-view.tsx,
// exclui o post). Popover ancorado no próprio botão, mesmo padrão já
// validado em notification-bell.tsx (fecha em click-fora/Escape) — dois
// passos DENTRO do mesmo popover (menu -> confirmação) em vez de abrir
// um modal-sobre-modal dentro do slide-over.
//
// `pending` só é zerado nos dois desfechos reais de handleConfirm
// (sucesso/erro) — nunca em closeMenu(). Isso é o que impede
// double-submit mesmo se o usuário clicar fora/Escape/Cancelar enquanto
// a Server Action ainda está em voo e reabrir o popover em seguida: ele
// veria o botão "Excluir" de novo (closeMenu já reseta `confirming`),
// mas um clique nele cai em handleConfirm, que checa `pending` e não
// dispara uma segunda chamada. Cada instância deste componente tem seu
// próprio estado — excluir a mensagem X nunca desabilita a Y.
export function DeleteMenu({
  itemLabel,
  onDelete,
  triggerClassName,
}: {
  itemLabel: string;
  onDelete: () => Promise<void>;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) closeMenu();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeMenu();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
    setConfirming(false);
    setError(false);
  }

  async function handleConfirm() {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      await onDelete();
      setPending(false);
      closeMenu();
    } catch {
      setPending(false);
      setError(true);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Mais opções"
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          triggerClassName ??
          'flex h-9 w-9 items-center justify-center rounded-full text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]'
        }
      >
        •••
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 w-[220px] rounded-[12px] border border-[var(--pro-line)] bg-[var(--pro-panel-solid)] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,.35)]"
        >
          {!confirming ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => setConfirming(true)}
              className="block w-full rounded-[8px] px-3 py-2 text-left text-[12.5px] font-bold text-[var(--pro-red)] hover:bg-white/[.05]"
            >
              Excluir
            </button>
          ) : (
            <div className="p-1.5">
              <p className="text-[12px] text-[var(--pro-tx-70)]">Excluir {itemLabel}? Essa ação não pode ser desfeita.</p>
              {error && <p className="mt-1.5 text-[11.5px] text-[#ff8b80]">Não foi possível excluir. Tente de novo.</p>}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeMenu}
                  className="rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-bold text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={pending}
                  aria-busy={pending}
                  className="rounded-[8px] bg-[var(--pro-red)] px-2.5 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-60"
                >
                  {pending ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
