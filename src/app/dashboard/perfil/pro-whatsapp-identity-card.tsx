'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { confirmWhatsappVerificationAction, requestWhatsappVerificationAction, revokeWhatsappVerificationAction } from '../whatsapp-identity-actions';
import { proGhostButtonClass, proInputClass, proLabelClass, proPrimaryButtonClass } from '../pro-format';
import { ProCard } from '../pro-ui';

// Item 12.2 (Configurações — WhatsApp) da revisão Professional Web
// Dashboard, 06/09/2026 — primeira UI de verificação de WhatsApp do
// profissional no Web (boundary já existia, migration 0064,
// whatsapp-identity-actions.ts, sem UI nenhuma até agora). Mesmo fluxo
// real: pedir código -> receber por WhatsApp de verdade
// (sendWhatsappTextMessage) -> confirmar. Nunca trata um número só
// digitado como identidade confiável — só depois do código confirmado.
export function ProWhatsappIdentityCard({
  status,
  verifiedNumber,
}: {
  status: string | null;
  verifiedNumber: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<'view' | 'phone' | 'code'>('view');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isVerified = status === 'verified';

  function handleRequest() {
    setError(null);
    startTransition(async () => {
      const result = await requestWhatsappVerificationAction({ candidateNumber: phone });
      if (result.kind === 'error') {
        setError(result.error);
        return;
      }
      setInfo('Enviamos um código de 6 dígitos pro seu WhatsApp.');
      setStep('code');
    });
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmWhatsappVerificationAction({ code });
      if (result.kind === 'error') {
        setError(result.error);
        return;
      }
      setStep('view');
      setPhone('');
      setCode('');
      setInfo(null);
      router.refresh();
    });
  }

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      await revokeWhatsappVerificationAction();
      router.refresh();
    });
  }

  return (
    <ProCard>
      <p className="font-pro-sub text-[13.5px] font-bold">Seu WhatsApp</p>

      {step === 'view' && (
        <>
          {isVerified ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-[var(--pro-off)]">
                <span className="text-[var(--pro-green)]">✓ WhatsApp verificado</span> · {verifiedNumber}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep('phone')} className={proGhostButtonClass}>
                  Alterar número
                </button>
                <button type="button" onClick={handleRevoke} disabled={pending} className={proGhostButtonClass}>
                  Remover
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12.5px] text-[var(--pro-tx-50)]">
                {status === 'pending_verification' || status === 'pending_replacement'
                  ? 'Verificação pendente — confirme o código enviado, ou peça um novo.'
                  : 'Ainda não verificado. Sem isso, a Doopla pode não reconhecer você automaticamente numa conversa.'}
              </p>
              <button type="button" onClick={() => setStep('phone')} className={proPrimaryButtonClass}>
                Verificar WhatsApp
              </button>
            </div>
          )}
        </>
      )}

      {step === 'phone' && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <span className={proLabelClass}>Número (com DDD e código do país)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 91234-5678"
              className={proInputClass}
            />
          </label>
          <button type="button" onClick={handleRequest} disabled={pending || !phone} className={proPrimaryButtonClass}>
            {pending ? 'Enviando…' : 'Enviar código'}
          </button>
          <button type="button" onClick={() => setStep('view')} className={proGhostButtonClass}>
            Cancelar
          </button>
        </div>
      )}

      {step === 'code' && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {info && <p className="w-full text-[12px] text-[var(--pro-tx-50)]">{info}</p>}
          <label className="flex flex-col gap-1.5">
            <span className={proLabelClass}>Código de 6 dígitos</span>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              className={`${proInputClass} w-[140px]`}
            />
          </label>
          <button type="button" onClick={handleConfirm} disabled={pending || code.length < 6} className={proPrimaryButtonClass}>
            {pending ? 'Confirmando…' : 'Confirmar'}
          </button>
          <button type="button" onClick={() => setStep('phone')} className={proGhostButtonClass}>
            Reenviar
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-[12.5px] text-[var(--pro-red)]">{error}</p>}
    </ProCard>
  );
}
