'use client';

import { useActionState, useState } from 'react';

import type { PixKeyType } from '@/lib/supabase/types';
import { eyebrowClass, ghostButtonClass, primaryButtonClass, cardClass } from '../ui';
import { setPaymentDetailsAction } from './payment-details-actions';

const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória',
};

// Mostra só um pedaço da chave — reforça "protegido" sem precisar de
// texto explicando arquitetura de segurança nenhuma.
function maskPixKey(value: string): string {
  if (value.length <= 6) return '•'.repeat(Math.max(value.length - 2, 2)) + value.slice(-2);
  return value.slice(0, 3) + '•••••' + value.slice(-3);
}

export function PaymentDetailsCard({
  active,
}: {
  active: { pixKeyType: PixKeyType; pixKey: string; holderName: string | null } | null;
}) {
  // Sem efeito: quando o save é bem-sucedido, revalidatePath faz a page
  // (server component) refazer a query e passar um `active` novo pra
  // este componente via `key` (ver payment-details-card wrapper na
  // page) — o remount inicializa `editing` fresco a partir do prop
  // novo, sem precisar sincronizar estado manualmente num useEffect.
  const [editing, setEditing] = useState(!active);
  const [state, formAction, pending] = useActionState(setPaymentDetailsAction, {});

  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Dados de recebimento</p>
      <p className="mt-1.5 text-sm text-[var(--ink)]/60">
        É por aqui que sua Doopla organiza os dados usados para seus pagamentos.
      </p>

      {!editing && active && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed border-[var(--ink)]/20 bg-[var(--paper-dim)] p-4">
          <div>
            <p className="text-sm font-medium">
              Pix · {PIX_KEY_TYPE_LABELS[active.pixKeyType]}
            </p>
            <p className="font-doopla-mono mt-0.5 text-[13px] text-[var(--ink)]/60">
              {maskPixKey(active.pixKey)}
              {active.holderName ? ` · ${active.holderName}` : ''}
            </p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className={ghostButtonClass}>
            Alterar
          </button>
        </div>
      )}

      {editing && (
        <form action={formAction} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={eyebrowClass}>Tipo de chave Pix</span>
            <select
              name="pixKeyType"
              defaultValue={active?.pixKeyType ?? ''}
              className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
            >
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
            <span className={eyebrowClass}>Chave Pix</span>
            <input
              type="text"
              name="pixKey"
              defaultValue={active?.pixKey ?? ''}
              placeholder="Sua chave Pix"
              className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={eyebrowClass}>Nome do titular (opcional)</span>
            <input
              type="text"
              name="holderName"
              defaultValue={active?.holderName ?? ''}
              placeholder="Nome de quem recebe"
              className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
            />
          </label>

          <p className="text-[12px] text-[var(--ink)]/50">
            Seus dados de recebimento ficam protegidos na sua conta Doopla.
          </p>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
            {active && (
              <button type="button" onClick={() => setEditing(false)} className={ghostButtonClass}>
                Cancelar
              </button>
            )}
            {state.error && <p className="text-sm text-red-700">{state.error}</p>}
          </div>
        </form>
      )}
    </section>
  );
}
