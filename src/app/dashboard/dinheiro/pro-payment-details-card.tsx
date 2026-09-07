'use client';

import { useActionState, useState } from 'react';

import type { ActivePaymentDetails } from '../data';
import { proGhostButtonClass, proInputClass, proLabelClass, proPrimaryButtonClass } from '../pro-format';
import { ProCard } from '../pro-ui';
import { setPaymentDetailsAction } from './payment-details-actions';
import type { PixKeyType } from '@/lib/supabase/types';

const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória',
};

function maskPixKey(value: string): string {
  if (value.length <= 6) return '•'.repeat(Math.max(value.length - 2, 2)) + value.slice(-2);
  return value.slice(0, 3) + '•••••' + value.slice(-3);
}

// Único formulário/lógica de Dados de recebimento (07/09/2026) —
// reutilizado tanto em Financeiro (ProPaymentDetailsCard, dentro de um
// ProCard) quanto em Configurações (dentro do ProAccordion, ver
// pro-configuracoes-view.tsx). Mesma Server Action
// (setPaymentDetailsAction -> set_payment_details, migration 0046),
// mesmo estado, sem nenhuma cópia paralela — nunca duplicar esta
// lógica em outro componente.
export function PaymentDetailsFields({ active }: { active: ActivePaymentDetails | null }) {
  const [editing, setEditing] = useState(!active);
  const [state, formAction, pending] = useActionState(setPaymentDetailsAction, {});

  return (
    <>
      <p className="text-[12.5px] text-[var(--pro-tx-50)]">
        A Doopla usa estes dados quando precisa orientar o cliente sobre o pagamento. O pagamento é feito diretamente para você.
      </p>

      {!editing && active && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed border-[var(--pro-line)] bg-white/[0.02] p-4">
          <div>
            <p className="text-[13px] font-medium text-[var(--pro-off)]">Pix · {PIX_KEY_TYPE_LABELS[active.pixKeyType]}</p>
            <p className="font-doopla-mono mt-0.5 text-[12px] text-[var(--pro-tx-50)]">
              {maskPixKey(active.pixKey)}
              {active.holderName ? ` · ${active.holderName}` : ''}
            </p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className={proGhostButtonClass}>
            Alterar
          </button>
        </div>
      )}

      {editing && (
        <form action={formAction} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={proLabelClass}>Tipo de chave Pix</span>
            <select name="pixKeyType" defaultValue={active?.pixKeyType ?? ''} className={proInputClass}>
              <option value="" disabled>
                Escolha o tipo da chave
              </option>
              {(Object.keys(PIX_KEY_TYPE_LABELS) as PixKeyType[]).map((type) => (
                <option key={type} value={type}>
                  {PIX_KEY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={proLabelClass}>Chave Pix</span>
            <input type="text" name="pixKey" defaultValue={active?.pixKey ?? ''} placeholder="Sua chave Pix" className={proInputClass} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={proLabelClass}>Nome do titular (opcional)</span>
            <input type="text" name="holderName" defaultValue={active?.holderName ?? ''} placeholder="Nome de quem recebe" className={proInputClass} />
          </label>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className={proPrimaryButtonClass}>
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
            {active && (
              <button type="button" onClick={() => setEditing(false)} className={proGhostButtonClass}>
                Cancelar
              </button>
            )}
            {state.error && <p className="text-[12.5px] text-[var(--pro-red)]">{state.error}</p>}
          </div>
        </form>
      )}
    </>
  );
}

// Re-skin de PaymentDetailsCard (item 10 da revisão Professional Web
// Dashboard, 06/09/2026) — usado em Financeiro. Configurações usa
// PaymentDetailsFields direto, dentro do ProAccordion (sem ProCard
// aninhado — o próprio accordion já dá o container visual).
export function ProPaymentDetailsCard({ active }: { active: ActivePaymentDetails | null }) {
  return (
    <ProCard>
      <p className="font-pro-sub text-[13.5px] font-bold">Dados de recebimento</p>
      <div className="mt-1.5">
        <PaymentDetailsFields active={active} />
      </div>
    </ProCard>
  );
}
