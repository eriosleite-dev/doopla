'use client';

import { useActionState, useState } from 'react';

import { requestAccountClosureAction, type AccountClosureFormState } from '../../../account-closure-actions';
import { proInputClass, proLabelClass } from '../../../pro-format';

const initialState: AccountClosureFormState = {};

// Sem dark pattern: o CTA destrutivo só habilita depois do checkbox
// marcado, nunca vem pré-marcado, nunca some o botão "cancelar" (aqui,
// o link "← Configurações" do header já cumpre esse papel — nenhum
// botão extra de cancelar precisa competir visualmente com o
// destrutivo).
export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(requestAccountClosureAction, initialState);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <p className="text-[13.5px] font-semibold text-[var(--pro-off)]">Excluir conta?</p>

      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>Digite sua senha pra confirmar</span>
        <input type="password" name="password" autoComplete="current-password" className={proInputClass} />
      </label>

      <label className="flex items-start gap-2.5 text-[12.5px] text-[var(--pro-tx-50)]">
        <input
          type="checkbox"
          name="confirmed"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        Entendo que esta ação é permanente.
      </label>

      {state.error && <p className="text-[12.5px] text-[var(--pro-red)]">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || !confirmed}
        className="self-start rounded-full bg-[var(--pro-red)] px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
      >
        {pending ? 'Excluindo…' : 'Excluir minha conta'}
      </button>
    </form>
  );
}
