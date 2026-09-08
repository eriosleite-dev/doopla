'use client';

import { useActionState } from 'react';

import { updatePasswordAction } from '../../account-security-actions';
import { proInputClass, proLabelClass, proPrimaryButtonClass } from '../../pro-format';

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <p className="font-pro-sub text-[13.5px] font-bold">Senha</p>
      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>Senha atual</span>
        <input type="password" name="currentPassword" autoComplete="current-password" className={proInputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>Nova senha</span>
        <input type="password" name="newPassword" minLength={8} autoComplete="new-password" className={proInputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>Confirmar nova senha</span>
        <input type="password" name="confirmPassword" minLength={8} autoComplete="new-password" className={proInputClass} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={`${proPrimaryButtonClass} self-start`}>
          {pending ? 'Salvando…' : 'Trocar senha'}
        </button>
        {state.success && <p className="text-[12.5px] text-[var(--pro-green)]">Senha alterada.</p>}
        {state.error && <p className="text-[12.5px] text-[var(--pro-red)]">{state.error}</p>}
      </div>
    </form>
  );
}
