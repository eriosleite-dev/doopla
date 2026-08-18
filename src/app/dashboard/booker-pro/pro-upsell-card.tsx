'use client';

import { cardClass, eyebrowClass, ghostButtonClass } from '../ui';
import { useProModal } from './pro-modal-context';

// Só renderizado pelo Dashboard quando plan === 'basic' (a checagem de
// "quem já é Pro não vê upsell" fica no server component chamador).
export function ProUpsellCard() {
  const { openModal } = useProModal();

  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Faça mais com a doopla</p>
      <h2 className="font-doopla-display mt-2 text-lg font-semibold">Desbloqueie o Booker Pro</h2>
      <p className="mt-1.5 text-sm text-[var(--ink)]/60">
        Transforme a doopla no seu assistente pra organizar bookings, automatizar sua rotina e
        atender mais artistas.
      </p>
      <p className="font-doopla-mono mt-3 text-[11px] uppercase tracking-[.05em] text-[var(--accent-ink)]">
        Booker Pro · R$49/mês
      </p>
      <button type="button" onClick={openModal} className={`${ghostButtonClass} mt-4 w-fit`}>
        Ver o que desbloqueia
      </button>
    </section>
  );
}
