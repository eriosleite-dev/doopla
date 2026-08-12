'use client';

import { useActionState, useState } from 'react';

import { formatCentsAsBRL, formatPercent, formatRelativeDate } from '@/lib/format';

import { acceptOpportunityAction, counterOpportunityAction, dismissOpportunityAction } from '../actions';
import type { OpportunityWithArtist } from '../data';
import {
  accentButtonClass,
  avatarClass,
  cardClass,
  eyebrowClass,
  ghostButtonClass,
  initialsFromName,
  rustGhostButtonClass,
} from '../ui';

export function OpportunityCard({ opportunity }: { opportunity: OpportunityWithArtist }) {
  const [countering, setCountering] = useState(false);
  const [state, counterAction, pending] = useActionState(counterOpportunityAction, {});

  return (
    <li className={cardClass}>
      <div className="flex items-start gap-4">
        <span className={avatarClass}>{initialsFromName(opportunity.artistName)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{opportunity.artistName}</p>
          <p className="mt-1 text-sm text-[var(--ink)]/75">{opportunity.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[var(--ink)]/55">
            <span>
              {opportunity.cache_amount_cents != null
                ? formatCentsAsBRL(opportunity.cache_amount_cents)
                : 'Cachê ainda não fechado'}
            </span>
            <span>{formatPercent(opportunity.commission_percent)} de comissão</span>
            <span className="font-doopla-mono text-[11px]">
              {formatRelativeDate(opportunity.created_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--line-light)] pt-5">
        <form action={acceptOpportunityAction}>
          <input type="hidden" name="opportunityId" value={opportunity.id} />
          <button type="submit" className={accentButtonClass}>
            Aceitar nesses termos
          </button>
        </form>

        {!countering ? (
          <button
            type="button"
            onClick={() => setCountering(true)}
            className={rustGhostButtonClass}
          >
            Propor outra comissão
          </button>
        ) : (
          <form action={counterAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <label className="flex items-center gap-2">
              <span className={eyebrowClass}>Comissão</span>
              <input
                type="text"
                inputMode="decimal"
                name="commissionPercent"
                required
                placeholder="Ex: 15"
                className="w-24 rounded-full border border-[var(--ink)]/20 bg-white px-3 py-2 text-sm"
              />
            </label>
            <button type="submit" disabled={pending} className={accentButtonClass}>
              {pending ? 'Enviando…' : 'Enviar'}
            </button>
          </form>
        )}

        <form action={dismissOpportunityAction} className="ml-auto">
          <input type="hidden" name="opportunityId" value={opportunity.id} />
          <button type="submit" className={ghostButtonClass}>
            Não tenho interesse
          </button>
        </form>
      </div>
      {state.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
    </li>
  );
}
