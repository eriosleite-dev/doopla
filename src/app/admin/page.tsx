import Link from 'next/link';

import { getAdminBetaPulse, getAdminAiCostSummary } from '@/lib/admin/data';
import { estimateAiCostCents } from '@/lib/admin/ai-pricing';

import { getAdminSession } from './session';

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[.06em] text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-50">{value}</p>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const { supabase } = await getAdminSession();
  const [pulse, costRows] = await Promise.all([getAdminBetaPulse(supabase), getAdminAiCostSummary(supabase)]);

  let configuredCostCents = 0;
  let hasUnconfiguredModel = false;
  for (const row of costRows) {
    const estimate = estimateAiCostCents({
      model: row.model,
      usageDate: row.usage_date,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
    });
    if (estimate.configured) {
      configuredCostCents += estimate.costCents;
    } else {
      hasUnconfiguredModel = true;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Visão geral</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Usuários ativos" value={pulse?.active_profiles_count ?? '—'} />
        <StatTile label="Cadastros (7d)" value={pulse?.signups_last_7d ?? '—'} />
        <StatTile label="Cadastros (30d)" value={pulse?.signups_last_30d ?? '—'} />
        <StatTile
          label="Custo estimado das chamadas monitoradas (30d)"
          value={`R$ ${(configuredCostCents / 100).toFixed(2)}${hasUnconfiguredModel ? '*' : ''}`}
        />
      </div>

      <p className="text-[12px] text-zinc-600">Algumas chamadas de IA ainda não estão incluídas neste cálculo.</p>

      {hasUnconfiguredModel && (
        <p className="text-[12px] text-zinc-500">
          * Pelo menos um modelo usado no período não tem preço configurado em{' '}
          <code className="text-zinc-400">src/lib/admin/ai-pricing.ts</code> — tokens contados normalmente, custo não estimado pra essa
          parcela. Ver detalhe em{' '}
          <Link href="/admin/ia-custo" className="underline">
            Custo de IA
          </Link>
          .
        </p>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[.06em] text-zinc-500">Pulso do beta (7 dias)</p>
        <div className="mt-2 flex gap-6 text-sm text-zinc-300">
          <span>{pulse?.product_events_last_7d ?? '—'} product events</span>
          <span>{pulse?.intervention_moments_last_7d ?? '—'} intervention moments</span>
        </div>
      </div>
    </div>
  );
}
