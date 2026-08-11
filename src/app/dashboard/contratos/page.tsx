import type { Metadata } from 'next';

import { getSessionProfile } from '../session';
import { cardClass, eyebrowClass } from '../ui';

export const metadata: Metadata = {
  title: 'Contratos | Doopla',
};

export default async function ContratosPage() {
  await getSessionProfile();

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Central de contratos</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Contratos
        </h1>
      </header>

      <p className={`${cardClass} text-sm text-[var(--ink)]/60`}>
        Geração e gestão de contrato chegam em breve. Por enquanto, combine o
        contrato de cada trabalho por fora da doopla.
      </p>
    </main>
  );
}
