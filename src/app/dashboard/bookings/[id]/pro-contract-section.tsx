'use client';

import { useActionState, useState } from 'react';

import { setContractUrlAction, uploadContractFileAction } from '../../actions';
import { ProGenerateContractForm } from '../../contratos/pro-generate-contract-form';
import { contractStatus, type BookingWithOtherParty } from '../../data';
import { proInputClass, proPrimaryButtonClass, proStatusPillClass } from '../../pro-format';
import { CONTRACT_STATUS_LABELS } from '../../ui';

type Mode = 'closed' | 'gerar' | 'anexar';

// Pro re-skin (Bloco 7, P1) de ContractSection — mesma action/lógica,
// só o tema --pro-*.
export function ProContractSection({ booking }: { booking: BookingWithOtherParty }) {
  const status = contractStatus(booking);
  const [mode, setMode] = useState<Mode>('closed');
  const [state, formAction, pending] = useActionState(setContractUrlAction, {});
  const [uploadState, uploadFormAction, uploadPending] = useActionState(uploadContractFileAction, {});
  const generatedByDoopla = booking.contract_url?.startsWith('/dashboard/contratos/documento/');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className={
            status === 'anexado'
              ? proStatusPillClass('green')
              : 'font-pro-sub inline-block whitespace-nowrap rounded-full bg-white/[0.06] px-2.5 py-1 text-[10.5px] font-bold text-[var(--pro-tx-50)]'
          }
        >
          {CONTRACT_STATUS_LABELS[status]}
        </span>
        {status === 'anexado' && booking.contract_url && (
          <a
            href={booking.contract_url}
            target={generatedByDoopla ? undefined : '_blank'}
            rel={generatedByDoopla ? undefined : 'noopener noreferrer'}
            className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--pro-red)] underline"
          >
            {generatedByDoopla ? 'Ver contrato gerado pela doopla' : 'Ver contrato'}
          </a>
        )}
      </div>

      {mode === 'closed' && (
        <div className="flex flex-wrap items-center gap-4">
          {/* Direct Booking (16/09/2026) — o contrato padrão Doopla
              exige um Booker real (buildContractContent monta as duas
              PARTES). Sem Booker é uma ação impossível hoje (decisão
              de produto: PENDING, sem template novo nesta rodada) —
              nunca oferecer o botão sabendo que ele sempre falha.
              "Anexar contrato próprio" continua disponível: é
              tecnicamente independente de Booker. */}
          {booking.booker_profile_id !== null ? (
            <button
              type="button"
              onClick={() => setMode('gerar')}
              className="font-doopla-mono w-fit text-[11px] uppercase tracking-[.05em] text-[var(--pro-tx-50)] underline hover:text-[var(--pro-off)]"
            >
              Gerar contrato com a doopla
            </button>
          ) : (
            <span className="text-[11px] text-[var(--pro-tx-30)]">
              Contrato padrão da Doopla ainda não disponível para bookings sem Booker.
            </span>
          )}
          <button
            type="button"
            onClick={() => setMode('anexar')}
            className="font-doopla-mono w-fit text-[11px] uppercase tracking-[.05em] text-[var(--pro-tx-50)] underline hover:text-[var(--pro-off)]"
          >
            {status === 'anexado' ? 'Trocar link' : 'Anexar contrato próprio'}
          </button>
        </div>
      )}

      {mode === 'gerar' && <ProGenerateContractForm booking={booking} onCancel={() => setMode('closed')} />}

      {mode === 'anexar' && (
        <div className="flex flex-col gap-3">
          <form action={uploadFormAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="bookingId" value={booking.id} />
            <input
              type="file"
              name="contractFile"
              required
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="min-w-0 flex-1 text-[12px] text-[var(--pro-tx-50)] file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-[11px] file:text-[var(--pro-off)]"
            />
            <button type="submit" disabled={uploadPending} className={proPrimaryButtonClass}>
              {uploadPending ? 'Enviando…' : 'Enviar arquivo'}
            </button>
            {uploadState.error && <p className="w-full text-sm text-[#ff8b80]">{uploadState.error}</p>}
          </form>

          <form action={formAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="bookingId" value={booking.id} />
            <span className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--pro-tx-30)]">ou cole um link</span>
            <input type="url" name="contractUrl" placeholder="https://..." className={`min-w-0 flex-1 ${proInputClass}`} />
            <button type="submit" disabled={pending} className={proPrimaryButtonClass}>
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
            {state.error && <p className="w-full text-sm text-[#ff8b80]">{state.error}</p>}
          </form>

          <button
            type="button"
            onClick={() => setMode('closed')}
            className="font-doopla-mono w-fit text-[11px] uppercase tracking-[.05em] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
