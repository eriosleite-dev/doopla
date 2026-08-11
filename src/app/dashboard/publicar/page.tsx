import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createOpportunityAction } from '../actions';
import { CommissionField } from '../commission-field';
import { getSessionProfile } from '../session';
import { cardClass, eyebrowClass, fieldInputClass, fieldLabelClass, fieldTextareaClass, primaryButtonClass } from '../ui';

export const metadata: Metadata = {
  title: 'Tenho um trabalho | Doopla',
};

export default async function PublicarPage() {
  const { profile } = await getSessionProfile();
  if (profile.role !== 'artista') {
    redirect('/dashboard/propor');
  }

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Tenho um trabalho</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Publicar pros bookers
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--ink)]/60">
          Conte o que já tem fechado ou quase fechado. Fica visível pros
          bookers que combinam com seu perfil até alguém assumir.
        </p>
      </header>

      <form
        action={createOpportunityAction}
        className={`${cardClass} flex flex-col gap-6`}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="description" className={fieldLabelClass}>
            O que é o trabalho?
          </label>
          <textarea
            id="description"
            name="description"
            required
            placeholder="Ex: Festival X, 15 de novembro, São Paulo. Cliente já demonstrou interesse."
            className={fieldTextareaClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="cacheAmount" className={fieldLabelClass}>
            Cachê estimado (opcional)
          </label>
          <div className="relative w-48">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[var(--ink)]/40">
              R$
            </span>
            <input
              id="cacheAmount"
              name="cacheAmount"
              type="number"
              inputMode="decimal"
              min={0}
              step={100}
              placeholder="10000"
              className={`${fieldInputClass} w-full pl-9`}
            />
          </div>
          <p className="text-[12.5px] text-[var(--ink)]/50">
            Deixe em branco se o cachê ainda não foi fechado.
          </p>
        </div>

        <CommissionField name="commission" label="Comissão que você topa pagar" />

        <button type="submit" className={`${primaryButtonClass} self-start`}>
          Publicar
        </button>
      </form>
    </main>
  );
}
