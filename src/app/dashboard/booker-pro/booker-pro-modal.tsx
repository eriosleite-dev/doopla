'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { upgradeToProAction } from '../actions';
import { accentButtonClass, eyebrowClass, ghostButtonClass } from '../ui';
import { useProModal } from './pro-modal-context';

type Step = 'info' | 'confirm' | 'success';

// Único modal de upgrade, aberto de qualquer ponto de entrada (sidebar,
// card do dashboard, upsell contextual). Copy honesta: nenhum recurso
// Pro implementado ainda, então nenhum benefício "pronto" é vendido
// aqui — só o mecanismo (ver DECISOES.md).
export function BookerProModal() {
  const { open, closeModal } = useProModal();
  const router = useRouter();
  const [step, setStep] = useState<Step>('info');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleClose() {
    closeModal();
    window.setTimeout(() => setStep('info'), 200);
  }

  function confirmUpgrade() {
    setError(null);
    startTransition(async () => {
      const result = await upgradeToProAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setStep('success');
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="flex w-full max-w-md flex-col gap-5 rounded-[24px] bg-[var(--paper)] p-7 shadow-2xl">
        {step === 'info' && (
          <>
            <div>
              <p className={eyebrowClass}>Booker Pro</p>
              <h2 className="font-doopla-display mt-1 text-2xl font-semibold">
                Transforme a Doopla no seu assistente de trabalho.
              </h2>
              <p className="font-doopla-display mt-2 text-2xl font-semibold text-[var(--accent-ink)]">
                R$49<span className="text-sm font-normal text-[var(--ink)]/55">/mês</span>
              </p>
            </div>
            <p className="text-sm text-[var(--ink)]/70">
              Em breve: mais automação, IA ampliada, análises, produtividade, organização e
              capacidade de atender mais artistas e bookings. Os recursos vão aparecer aqui
              conforme forem implementados.
            </p>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => setStep('confirm')} className={accentButtonClass}>
                Fazer upgrade para o Pro
              </button>
              <button type="button" onClick={handleClose} className={ghostButtonClass}>
                Continuar no Básico
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div>
              <p className={eyebrowClass}>Confirmar assinatura</p>
              <h2 className="font-doopla-display mt-1 text-xl font-semibold">Booker Pro</h2>
            </div>
            <ul className="flex flex-col gap-1.5 text-sm text-[var(--ink)]/75">
              <li>• Plano: Booker Pro</li>
              <li>• R$49/mês</li>
              <li>• Cobrança mensal, recorrente</li>
              <li>• Começa a valer agora, ao confirmar</li>
              <li>• Cancela quando quiser — continua com os benefícios até o fim do ciclo já pago</li>
            </ul>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmUpgrade}
                disabled={pending}
                className={accentButtonClass}
              >
                {pending ? 'Confirmando…' : 'Confirmar assinatura'}
              </button>
              <button type="button" onClick={() => setStep('info')} className={ghostButtonClass}>
                Voltar
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <div>
              <p className={eyebrowClass}>Pronto</p>
              <h2 className="font-doopla-display mt-1 text-2xl font-semibold">
                Você agora é Booker Pro.
              </h2>
              <p className="mt-2 text-sm text-[var(--ink)]/70">
                Seus recursos Pro já estão disponíveis.
              </p>
            </div>
            <button type="button" onClick={handleClose} className={accentButtonClass}>
              Explorar o Pro
            </button>
          </>
        )}
      </div>
    </div>
  );
}
