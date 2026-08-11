import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createBookingProposalAction } from '../actions';
import { CommissionField } from '../commission-field';
import { getRepresentedArtists } from '../data';
import { getSessionProfile } from '../session';
import {
  cardClass,
  eyebrowClass,
  fieldInputClass,
  fieldLabelClass,
  fieldTextareaClass,
  primaryButtonClass,
  textLinkClass,
} from '../ui';

export const metadata: Metadata = {
  title: 'Tenho um trabalho | Doopla',
};

export default async function ProporPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'booker') {
    redirect('/dashboard/publicar');
  }

  const artists = await getRepresentedArtists(user.id, supabase);

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Tenho um trabalho</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Trazer um trabalho pra um artista
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--ink)]/60">
          Pra um artista que você já representa. O que já foi combinado com
          o cliente e a comissão que você propõe.
        </p>
      </header>

      {artists.length === 0 ? (
        <p className={`${cardClass} text-sm text-[var(--ink)]/60`}>
          Você ainda não tem nenhum artista confirmado.{' '}
          <Link href="/dashboard" className={textLinkClass}>
            Convide quem já trabalha com você
          </Link>{' '}
          pra poder propor trabalhos direto.
        </p>
      ) : (
        <form
          action={createBookingProposalAction}
          className={`${cardClass} flex flex-col gap-6`}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="artistProfileId" className={fieldLabelClass}>
              Artista
            </label>
            <select
              id="artistProfileId"
              name="artistProfileId"
              required
              defaultValue=""
              className={fieldInputClass}
            >
              <option value="" disabled>
                Escolha um artista
              </option>
              {artists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="description" className={fieldLabelClass}>
              O que já foi feito?
            </label>
            <textarea
              id="description"
              name="description"
              required
              placeholder='Ex: "O cliente já aprovou o artista e o cachê. Falta contrato e pagamento."'
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
          </div>

          <CommissionField name="commission" label="Comissão que você propõe" />

          <button type="submit" className={`${primaryButtonClass} self-start`}>
            Enviar ao artista
          </button>
        </form>
      )}
    </main>
  );
}
