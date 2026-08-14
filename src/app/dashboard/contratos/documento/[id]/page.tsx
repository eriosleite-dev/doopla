import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { formatRelativeDate } from '@/lib/format';

import { getBookingContract } from '../../../data';
import { getSessionProfile } from '../../../session';
import { eyebrowClass } from '../../../ui';
import { PrintButton } from './print-button';

export const metadata: Metadata = {
  title: 'Contrato | Doopla',
};

export default async function ContractDocumentPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, user, profile } = await getSessionProfile();

  const detail = await getBookingContract(id, user.id, profile.role, supabase);
  if (!detail) notFound();

  const { contract, booking } = detail;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <p className={eyebrowClass}>Contrato gerado pela doopla</p>
        <PrintButton />
      </div>

      <div className="rounded-[18px] border border-[var(--line-light)] bg-white p-8 print:border-0 print:p-0">
        <header className="border-b border-[var(--line-light)] pb-6">
          <p className="font-doopla-display text-2xl font-semibold">
            Instrumento de Prestação de Serviços Artísticos
          </p>
          <p className="mt-2 text-[12.5px] text-[var(--ink)]/55">
            Booking {booking.id.slice(0, 8)} · gerado {formatRelativeDate(contract.created_at)} ·
            versão do modelo {contract.template_version}
          </p>
        </header>

        <section className="mt-6 flex flex-col gap-6 text-[14px] leading-relaxed text-[var(--ink)]/85">
          <div>
            <p className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--accent-ink)]">
              1. Partes
            </p>
            <p className="mt-1.5">{contract.content.partes}</p>
          </div>
          <div>
            <p className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--accent-ink)]">
              2. Escopo
            </p>
            <p className="mt-1.5">{contract.content.escopo}</p>
          </div>
          <div>
            <p className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--accent-ink)]">
              3. Evento
            </p>
            <p className="mt-1.5">{contract.content.evento}</p>
          </div>
        </section>

        {contract.content.pendente.length > 0 && (
          <section className="mt-6 rounded-[14px] bg-[var(--paper-dim)] p-5 print:bg-transparent print:border print:border-dashed print:border-[var(--ink)]/30">
            <p className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/55">
              Cláusulas ainda não incluídas neste documento
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-[13px] text-[var(--ink)]/60">
              {contract.content.pendente.map((item) => (
                <li key={item}>— {item}</li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-8 text-[11px] text-[var(--ink)]/40">
          Documento gerado automaticamente a partir dos dados registrados neste booking na doopla.
          Este arquivo é imutável: alterações posteriores no booking não modificam o texto acima.
        </p>
      </div>
    </main>
  );
}
