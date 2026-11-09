'use client';

import { useActionState, useState } from 'react';

import { updateEmailAction } from '../../account-security-actions';
import { proGhostButtonClass, proInputClass, proLabelClass, proPrimaryButtonClass } from '../../pro-format';

export function ChangeEmailForm() {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateEmailAction, {});

  if (state.success) {
    return <p className="mt-3 text-[12.5px] text-[var(--pro-green)]">Enviamos um link de confirmação pro novo e-mail.</p>;
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className={`${proGhostButtonClass} mt-3`}>
        Alterar e-mail
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2.5">
      <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        <span className={proLabelClass}>Novo e-mail</span>
        <input type="email" name="email" placeholder="voce@email.com" className={proInputClass} />
      </label>
      <button type="submit" disabled={pending} className={proPrimaryButtonClass}>
        {pending ? 'Enviando…' : 'Enviar confirmação'}
      </button>
      <button type="button" onClick={() => setEditing(false)} className={proGhostButtonClass}>
        Cancelar
      </button>
      {state.error && <p className="w-full text-[12.5px] text-[var(--pro-red)]">{state.error}</p>}
    </form>
  );
}
