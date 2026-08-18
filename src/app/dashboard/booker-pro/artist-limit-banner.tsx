'use client';

import { accentButtonClass } from '../ui';
import { useProModal } from './pro-modal-context';

// Mostrado pro booker quando ele tenta aceitar um 2º artista estando
// no plano Básico — abre o mesmo modal padrão do Pro (spec 3.1).
export function ArtistLimitBanner() {
  const { openModal } = useProModal();

  return (
    <section className="rounded-[18px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-5">
      <p className="text-sm text-[var(--ink)]/80">
        Seu plano Básico permite 1 artista ativo. Quer atender mais artistas? Com o Booker Pro,
        você pode ampliar sua carteira e desbloquear os recursos Pro.
      </p>
      <button type="button" onClick={openModal} className={`${accentButtonClass} mt-3`}>
        Fazer upgrade para o Pro
      </button>
    </section>
  );
}
