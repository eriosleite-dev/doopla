'use client';

import { useEffect, useState } from 'react';

import { proGhostButtonClass } from '../pro-format';
import { DeleteAccountForm } from './privacidade/excluir/delete-account-form';

// Excluir conta por modal, não página própria (decisão da fundadora,
// 14/09/2026, ajuste ao acordeão de Configurações aprovado): é uma
// ação pontual/destrutiva, não precisa tirar o profissional de
// Configurações — mas a confirmação continua tão clara quanto era na
// página dedicada (mesmo texto, mesmo DeleteAccountForm com senha +
// checkbox, sem dark pattern). Mesmo padrão de overlay já usado em
// ProUpgradeModal (ESC fecha, scroll do body trava, clique fora fecha).
//
// Ajuste de proteção (14/09/2026, achado da fundadora): o primeiro
// clique em "Excluir minha conta" nunca pode ir direto pro formulário
// com senha — precisa passar por um passo de confirmação simples
// antes. Dois passos dentro do mesmo modal: 'confirm' (aviso curto,
// Cancelar/Excluir minha conta) → só ao confirmar aqui, 'form' revela
// o conteúdo detalhado + DeleteAccountForm de sempre (senha + checkbox
// + submit real), sem nenhuma mudança na lógica/backend de exclusão —
// só a UX de proteção em volta dela.
export function DeleteAccountModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'confirm' | 'form'>('confirm');

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function handleOpen() {
    setStep('confirm');
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full rounded-[14px] border border-[rgba(226,41,28,.35)] px-4 py-3 text-left text-[13px] font-semibold text-[var(--pro-red)] transition-colors hover:bg-[rgba(226,41,28,.06)]"
      >
        Excluir minha conta
      </button>

      {open && (
        <div className="pro-shell contents">
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6" role="presentation">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />

            <div
              role="dialog"
              aria-modal="true"
              aria-label="Excluir minha conta"
              className="relative max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-[24px] border border-[var(--pro-line)] bg-[var(--pro-panel-solid)] p-6 sm:p-7"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="absolute top-5 right-5 flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]"
              >
                ✕
              </button>

              {step === 'confirm' ? (
                <>
                  <p className="pr-8 text-[15px] font-bold text-[var(--pro-off)]">Excluir minha conta?</p>
                  <p className="mt-2 text-[12.5px] text-[var(--pro-tx-50)]">
                    Esta ação excluirá permanentemente sua conta e não poderá ser desfeita.
                  </p>
                  <div className="mt-5 flex gap-3">
                    <button type="button" onClick={() => setOpen(false)} className={`${proGhostButtonClass} flex-1 justify-center`}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('form')}
                      className="flex-1 rounded-full bg-[var(--pro-red)] px-5 py-2.5 text-center text-[12.5px] font-semibold text-white"
                    >
                      Excluir minha conta
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="pr-8 text-[15px] font-bold text-[var(--pro-off)]">Excluir sua conta é uma ação permanente.</p>
                  <p className="mt-2 text-[12.5px] text-[var(--pro-tx-50)]">
                    Antes de continuar, veja o que acontece com sua assinatura, seus dados e seu histórico.
                  </p>

                  <ul className="mt-4 flex flex-col gap-2.5 text-[12.5px] text-[var(--pro-tx-50)]">
                    <li>
                      <strong className="text-[var(--pro-off)]">Assinatura:</strong> é cancelada — a Doopla para de
                      representar você a partir daqui.
                    </li>
                    <li>
                      <strong className="text-[var(--pro-off)]">Bookings e contratos:</strong> continuam existindo,
                      intactos, pra preservar o histórico de quem trabalhou com você. Ninguém consegue criar um
                      booking novo com você depois disso.
                    </li>
                    <li>
                      <strong className="text-[var(--pro-off)]">Booker/representação:</strong> qualquer vínculo ativo
                      é encerrado.
                    </li>
                    <li>
                      <strong className="text-[var(--pro-off)]">Comunidade:</strong> seu perfil passa a aparecer como
                      &ldquo;Usuário removido&rdquo;. Tópicos e respostas que você escreveu continuam existindo — não
                      apagamos discussões coletivas.
                    </li>
                    <li>
                      <strong className="text-[var(--pro-off)]">Canais:</strong> seu link de orçamento e roteamento
                      de WhatsApp são desativados.
                    </li>
                    <li>
                      <strong className="text-[var(--pro-off)]">Depois:</strong> você é desconectado de todos os
                      dispositivos. Um cadastro novo com o mesmo e-mail no futuro é uma conta nova — nada é
                      restaurado automaticamente.
                    </li>
                  </ul>

                  <div className="mt-5 border-t border-[var(--pro-line)] pt-5">
                    <DeleteAccountForm />
                  </div>

                  <button type="button" onClick={() => setOpen(false)} className={`${proGhostButtonClass} mt-3 w-full justify-center`}>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
