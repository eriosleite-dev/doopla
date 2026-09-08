'use client';

import { useActionState } from 'react';

import { updateAccountInfoAction } from '../../actions';
import { proInputClass, proLabelClass, proPrimaryButtonClass } from '../../pro-format';

export function AccountInfoForm({ fullName, phone }: { fullName: string; phone: string | null }) {
  const [state, formAction, pending] = useActionState(updateAccountInfoAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <p className="font-pro-sub text-[13.5px] font-bold">Informações da conta</p>
      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>Nome</span>
        <input type="text" name="fullName" defaultValue={fullName} className={proInputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>Telefone de contato</span>
        <input type="tel" name="phone" defaultValue={phone ?? ''} placeholder="(00) 00000-0000" className={proInputClass} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={`${proPrimaryButtonClass} self-start`}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        {state.success && <p className="text-[12.5px] text-[var(--pro-green)]">Salvo.</p>}
        {state.error && <p className="text-[12.5px] text-[var(--pro-red)]">{state.error}</p>}
      </div>
    </form>
  );
}
