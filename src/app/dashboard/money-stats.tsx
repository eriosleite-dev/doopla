import { formatCentsAsBRL, formatPercent } from '@/lib/format';
import type { Booking } from '@/lib/supabase/types';

import { computeArtistStats, computeBookerStats } from './data';
import {
  statCardClass,
  statCardLeadClass,
  statLabelClass,
  statLabelLeadClass,
  statSubClass,
  statSubUpClass,
  statValueClass,
  statValueLeadClass,
} from './ui';

function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((current - prev) / prev) * 100);
}

export function BookerMoneyStats({ bookings }: { bookings: Booking[] }) {
  const stats = computeBookerStats(bookings);
  const change = pctChange(stats.monthEarnedCents, stats.monthEarnedPrevCents);

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className={statCardLeadClass}>
        <p className={statLabelLeadClass}>Comissão total ganha</p>
        <p className={statValueLeadClass}>{formatCentsAsBRL(stats.totalEarnedCents)}</p>
        <p className="mt-2 text-[12.5px] text-[var(--paper)]/60">
          Em bookings concluídos
        </p>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Receita do mês</p>
        <p className={statValueClass}>{formatCentsAsBRL(stats.monthEarnedCents)}</p>
        <p className={change !== null && change >= 0 ? statSubUpClass : statSubClass}>
          {change === null ? 'Sem comparação ainda' : `${change >= 0 ? '+' : ''}${change}% vs. mês anterior`}
        </p>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Bookings ativos</p>
        <p className={statValueClass}>{stats.activeCount}</p>
        <p className={statSubClass}>
          {stats.awaitingPaymentCount > 0
            ? `${stats.awaitingPaymentCount} aguardando pagamento`
            : 'Em andamento'}
        </p>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Taxa de aceite</p>
        <p className={statValueClass}>{formatPercent(stats.acceptanceRatePercent)}</p>
        <p className={statSubClass}>
          {stats.decidedCount > 0
            ? `${stats.acceptedCount} de ${stats.decidedCount} propostas`
            : 'Ainda sem propostas decididas'}
        </p>
      </div>
    </section>
  );
}

export function ArtistMoneyStats({ bookings }: { bookings: Booking[] }) {
  const stats = computeArtistStats(bookings);

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className={statCardLeadClass}>
        <p className={statLabelLeadClass}>Recebido líquido</p>
        <p className={statValueLeadClass}>{formatCentsAsBRL(stats.netReceivedCents)}</p>
        <p className="mt-2 text-[12.5px] text-[var(--paper)]/60">
          Já descontada a comissão do booker
        </p>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Recebido no mês</p>
        <p className={statValueClass}>{formatCentsAsBRL(stats.monthNetReceivedCents)}</p>
        <p className={statSubClass}>Líquido, mês atual</p>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Bookings fechados</p>
        <p className={statValueClass}>{stats.closedCount}</p>
        <p className={statSubClass}>Concluídos até agora</p>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Comissão média paga</p>
        <p className={statValueClass}>{formatPercent(stats.avgCommissionPercent)}</p>
        <p className={statSubClass}>Últimos bookings fechados</p>
      </div>
    </section>
  );
}
