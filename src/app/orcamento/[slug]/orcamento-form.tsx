'use client';

import { useActionState } from 'react';

import { submitOrcamentoRequestAction } from './actions';

const fieldInputClass =
  'w-full rounded-[12px] border border-[var(--pro-line)] bg-white/[0.03] px-4 py-3 text-base text-[var(--pro-off)] outline-none placeholder:text-[var(--pro-tx-30)] focus:border-[var(--pro-red)]';
const fieldLabelClass = 'text-[12px] font-semibold text-[var(--pro-tx-50)]';

// Redesign 15/09/2026 (achado da fundadora) — simplificado de 6 campos
// pra 3: nome, contato e um resumo curto e opcional do que a pessoa
// precisa. Data do evento, local e valor sugerido saíram da tela
// inicial (auditoria confirmou que já eram opcionais pro backend,
// `submit_orcamento_request` aceita todos como null) porque a Doopla
// consegue perguntar isso na conversa depois. Nenhuma mudança em
// actions.ts nem no contrato do RPC: os 3 parâmetros ausentes
// continuam chegando como null pelo mesmo caminho de sempre
// (`formData.get(...)` retorna null quando o campo não existe no
// form).
export function OrcamentoForm({ slug, artistName }: { slug: string; artistName: string }) {
  const [state, formAction, pending] = useActionState(submitOrcamentoRequestAction, {});

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <p className="font-pro-sub text-[18px] font-bold text-[var(--pro-off)]">Atendimento iniciado</p>
        <p className="text-[13.5px] leading-relaxed text-[var(--pro-tx-70)]">
          A Doopla de {artistName} recebeu o que você contou e já está cuidando do seu pedido.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>Seu nome</span>
        <input type="text" name="clientName" required className={fieldInputClass} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>Telefone ou e-mail</span>
        <input type="text" name="clientContact" required className={fieldInputClass} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>O que você precisa (opcional)</span>
        <textarea
          name="description"
          rows={3}
          placeholder="Ex: casamento em outubro, preciso de um DJ"
          className={`${fieldInputClass} rounded-[16px]`}
        />
      </label>

      {state.error && <p className="text-[13px] text-[#ff8b80]">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex items-center justify-center rounded-full bg-[var(--pro-red)] px-5 py-3.5 text-[15px] font-bold text-[var(--pro-off)] shadow-[0_0_24px_rgba(226,41,28,.4)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Enviando…' : 'Falar com a Doopla'}
      </button>
    </form>
  );
}
