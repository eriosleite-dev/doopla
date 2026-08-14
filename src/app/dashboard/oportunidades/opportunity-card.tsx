import { formatCentsAsBRL, formatPercent, formatRelativeDate } from '@/lib/format';

import { declineInvitationAction, dismissOpportunityAction, expressInterestAction, withdrawInterestAction } from '../actions';
import type { OpportunityWithArtist } from '../data';
import {
  accentButtonClass,
  avatarClass,
  cardClass,
  ghostButtonClass,
  initialsFromName,
} from '../ui';

export function OpportunityCard({ opportunity }: { opportunity: OpportunityWithArtist }) {
  const invited = opportunity.myInvitationStatus === 'pendente';
  const declined = opportunity.myInvitationStatus === 'recusada';
  const interested = opportunity.myInterestStatus === 'pendente';

  return (
    <li className={cardClass}>
      <div className="flex items-start gap-4">
        <span className={avatarClass}>{initialsFromName(opportunity.artistName)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{opportunity.artistName}</p>
          {invited && (
            <span className="font-doopla-mono mt-1 inline-block rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-[10px] uppercase tracking-[.03em] text-[var(--accent-ink)]">
              Você foi convidado
            </span>
          )}
          <p className="mt-1 text-sm text-[var(--ink)]/75">{opportunity.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[var(--ink)]/55">
            <span>
              {opportunity.cache_amount_cents != null
                ? formatCentsAsBRL(opportunity.cache_amount_cents)
                : 'Cachê ainda não fechado'}
            </span>
            <span>{formatPercent(opportunity.commission_percent)} de comissão</span>
            {opportunity.category && <span>{opportunity.category}</span>}
            {opportunity.location && <span>{opportunity.location}</span>}
            <span className="font-doopla-mono text-[11px]">
              {formatRelativeDate(opportunity.created_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--line-light)] pt-5">
        {invited && (
          <>
            <span className="text-[13px] text-[var(--ink)]/60">
              Convite recebido do artista — quem decide é ele, você só confirma que topa.
            </span>
            <form action={declineInvitationAction} className="ml-auto">
              <input type="hidden" name="opportunityId" value={opportunity.id} />
              <button type="submit" className={ghostButtonClass}>
                Recusar convite
              </button>
            </form>
          </>
        )}

        {!invited && !declined && (
          <>
            {interested ? (
              <form action={withdrawInterestAction}>
                <input type="hidden" name="opportunityId" value={opportunity.id} />
                <button type="submit" className={ghostButtonClass}>
                  Retirar interesse
                </button>
              </form>
            ) : (
              <form action={expressInterestAction}>
                <input type="hidden" name="opportunityId" value={opportunity.id} />
                <button type="submit" className={accentButtonClass}>
                  Tenho interesse
                </button>
              </form>
            )}
            <form action={dismissOpportunityAction} className="ml-auto">
              <input type="hidden" name="opportunityId" value={opportunity.id} />
              <button type="submit" className={ghostButtonClass}>
                Não tenho interesse
              </button>
            </form>
          </>
        )}
      </div>
    </li>
  );
}
