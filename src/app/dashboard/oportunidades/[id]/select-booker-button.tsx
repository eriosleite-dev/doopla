'use client';

import { useActionState } from 'react';

import { selectBookerForOpportunityAction } from '../../actions';
import { accentButtonClass } from '../../ui';

export function SelectBookerButton({
  opportunityId,
  bookerProfileId,
}: {
  opportunityId: string;
  bookerProfileId: string;
}) {
  const [state, formAction, pending] = useActionState(selectBookerForOpportunityAction, {});

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="bookerProfileId" value={bookerProfileId} />
      <button type="submit" disabled={pending} className={accentButtonClass}>
        {pending ? 'Escolhendo…' : 'Escolher este booker'}
      </button>
      {state.error && <p className="text-[12px] text-red-700">{state.error}</p>}
    </form>
  );
}
