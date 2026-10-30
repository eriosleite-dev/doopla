'use client';

import { useState, useTransition } from 'react';

import { signOutOtherSessionsAction } from '../../account-security-actions';
import { proGhostButtonClass } from '../../pro-format';

export function SignOutOtherSessionsButton() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await signOutOtherSessionsAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={handleClick} disabled={pending || done} className={proGhostButtonClass}>
        {pending ? 'Encerrando…' : done ? 'Feito' : 'Sair dos outros dispositivos'}
      </button>
      {done && <p className="mt-2 text-[12.5px] text-[var(--pro-green)]">Outras sessões encerradas.</p>}
      {error && <p className="mt-2 text-[12.5px] text-[var(--pro-red)]">{error}</p>}
    </div>
  );
}
