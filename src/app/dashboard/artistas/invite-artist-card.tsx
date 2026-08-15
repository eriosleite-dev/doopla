'use client';

import { useActionState } from 'react';

import { inviteArtistAction } from '../actions';
import { cardClass, eyebrowClass, ghostButtonClass } from '../ui';
import type { Invite } from '@/lib/supabase/types';

const STATUS_LABEL: Record<Invite['status'], string> = {
  pendente: 'Aguardando',
  confirmado: 'Confirmado',
};

export function InviteArtistCard({ invites }: { invites: Invite[] }) {
  const [state, formAction, pending] = useActionState(inviteArtistAction, {});

  return (
    <section id="convites" className={cardClass}>
      <p className={eyebrowClass}>Convidar quem ainda não está na doopla</p>
      <p className="mt-1 text-sm text-[var(--ink)]/55">
        Já trabalha com esse artista fora da plataforma? Convide — quando a conta dele for
        criada e o convite confirmado, vocês já ficam representados na doopla.
      </p>

      <form action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className={eyebrowClass}>Nome do artista</span>
          <input
            type="text"
            name="name"
            required
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className={eyebrowClass}>Contato (opcional)</span>
          <input
            type="text"
            name="contact"
            placeholder="E-mail ou telefone"
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
          />
        </label>
        <button type="submit" disabled={pending} className={ghostButtonClass}>
          {pending ? 'Enviando…' : 'Convidar'}
        </button>
      </form>
      {state.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
      {state.success && (
        <p className="mt-2 text-sm text-[var(--musgo)]">Convite registrado.</p>
      )}

      {invites.length > 0 && (
        <div className="mt-5 flex flex-col gap-2 border-t border-[var(--ink)]/10 pt-4">
          {invites.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between text-sm">
              <span>{invite.invitee_name}</span>
              <span className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50">
                {STATUS_LABEL[invite.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
