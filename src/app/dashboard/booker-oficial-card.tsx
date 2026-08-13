import type { OfficialBookerProgress } from './data';
import { officialChipClass } from './ui';

export function BookerOficialCard({ progress }: { progress: OfficialBookerProgress }) {
  const { criteria, doneCount, total } = progress;
  const percent = Math.round((doneCount / total) * 100);

  return (
    <section className="rounded-[18px] bg-gradient-to-br from-[#1c1712] to-[#2a2117] p-6 text-[var(--paper)]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="font-doopla-mono flex items-center gap-2 text-[11px] uppercase tracking-[.08em] text-[var(--accent)]">
          ★ Booker Oficial Doopla
        </p>
        <div className="flex items-center gap-2.5">
          <span className="font-doopla-mono rounded-full bg-[var(--accent)]/15 px-3 py-1.5 text-[10px] uppercase tracking-[.03em] text-[var(--accent)]">
            Ganhe R$ · bônus por performance
          </span>
          <span className="font-doopla-mono text-[11px] text-[var(--paper)]/60">
            {doneCount} de {total} critérios
          </span>
        </div>
      </div>

      <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2.5 text-[12.5px] text-[var(--paper)]/60">
        {doneCount === total
          ? 'Todos os critérios atendidos.'
          : 'Falta pouco para desbloquear seu status. Continue movimentando bookings pela Doopla.'}
      </p>

      <div className="mt-3.5 flex flex-wrap gap-2">
        {criteria.map((c) => (
          <span key={c.key} className={officialChipClass(c.done)}>
            {c.done ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </section>
  );
}
