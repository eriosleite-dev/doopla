'use client';

import { useActionState } from 'react';

import { selectBookerForOpportunityAction } from '../../actions';
import { accentButtonClass } from '../../ui';

export function SelectBookerButton({
  opportunityId,
  bookerProfileId,
  needsCommission,
}: {
  opportunityId: string;
  bookerProfileId: string;
  needsCommission: boolean;
}) {
  const [state, formAction, pending] = useActionState(selectBookerForOpportunityAction, {});

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="bookerProfileId" value={bookerProfileId} />
      {needsCommission && (
        <label className="flex items-center gap-2 text-[12px] text-[var(--ink)]/60">
          Sua comissão (%)
          <input
            type="text"
            inputMode="decimal"
            name="commissionPercent"
            required
            placeholder="Ex: 15"
            className="w-20 rounded-full border border-[var(--ink)]/20 bg-white px-3 py-1.5 text-sm"
          />
        </label>
      )}
      <button type="submit" disabled={pending} className={accentButtonClass}>
        {pending ? 'Escolhendo…' : 'Escolher este booker'}
      </button>
      {state.error && <p className="text-[12px] text-red-700">{state.error}</p>}
    </form>
  );
}
