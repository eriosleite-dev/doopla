import Link from 'next/link';

import { getAgencyApplicationsWeeklySummary, getAgencyFunnelSummary, listAgencyApplications } from '@/lib/agencies/admin-data';
import { bucketByArtistsRepresented, bucketByTeamSize, computeConversionRates, groupByInterest, groupByLocation } from '@/lib/agencies/distribution';
import type { AgencyClassification, AgencyInterest, AgencyStatus } from '@/lib/agencies/types';

import { getAdminSession } from '../session';

const CLASSIFICATION_LABEL: Record<AgencyClassification, string> = {
  priority: 'Prioridade alta',
  future_potential: 'Potencial futuro',
  out_of_profile: 'Fora do perfil',
};

const STATUS_LABEL: Record<AgencyStatus, string> = {
  new: 'Nova',
  under_review: 'Em avaliação',
  contacted: 'Contatada',
  in_conversation: 'Em conversa',
  partner: 'Parceira',
  rejected: 'Rejeitada',
  archived: 'Arquivada',
};

const INTEREST_LABEL: Record<AgencyInterest, string> = {
  discovery_metrics: 'Descoberta e métricas',
  recurring_revenue: 'Receita recorrente',
  both: 'Ambos',
};

const FUNNEL_LABEL: Record<string, string> = {
  section_view: 'Visualizações da seção',
  cta_click: 'Cliques no CTA',
  form_start: 'Formulários iniciados',
  form_submit: 'Inscrições enviadas',
  form_abandon: 'Abandonos',
  classified: 'Classificadas',
};
const FUNNEL_ORDER = ['section_view', 'cta_click', 'form_start', 'form_submit', 'classified', 'form_abandon'];

type SearchParams = {
  classification?: string;
  status?: string;
  city?: string;
  country?: string;
  interest?: string;
  q?: string;
};

export default async function AdminAgenciasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { supabase } = await getAdminSession();
  const params = await searchParams;

  const [rows, funnelSummary, weeklySummary, pendingPriority, allApplications] = await Promise.all([
    listAgencyApplications(supabase, {
      classification: (params.classification as AgencyClassification) || undefined,
      status: (params.status as AgencyStatus) || undefined,
      city: params.city || undefined,
      country: params.country || undefined,
      interest: (params.interest as AgencyInterest) || undefined,
      query: params.q || undefined,
      limit: 100,
    }),
    getAgencyFunnelSummary(supabase, 7),
    getAgencyApplicationsWeeklySummary(supabase),
    listAgencyApplications(supabase, { classification: 'priority', status: 'new', limit: 50 }),
    // Conjunto completo (sem os filtros da tabela) pras distribuições
    // abaixo — nunca o mesmo `rows` filtrado, que mudaria o gráfico
    // toda vez que alguém filtrasse a tabela.
    listAgencyApplications(supabase, { limit: 500 }),
  ]);

  const conversionRates = computeConversionRates(funnelSummary);
  const teamSizeDistribution = bucketByTeamSize(allApplications);
  const artistsDistribution = bucketByArtistsRepresented(allApplications);
  const locationDistribution = groupByLocation(allApplications);
  const interestDistribution = groupByInterest(allApplications);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Agências Parceiras</h1>
        <Link href="/admin/agencias/configuracoes" className="text-[12px] text-zinc-400 hover:text-zinc-100">
          Configurações →
        </Link>
      </div>

      {pendingPriority.length > 0 && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
          {pendingPriority.length} inscrição{pendingPriority.length > 1 ? 'ões' : ''} prioritária{pendingPriority.length > 1 ? 's' : ''} aguardando
          avaliação.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {FUNNEL_ORDER.map((key) => (
          <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
            <p className="font-mono text-[9.5px] uppercase tracking-[.06em] text-zinc-500">{FUNNEL_LABEL[key] ?? key}</p>
            <p className="mt-1 text-xl font-semibold text-zinc-100">{funnelSummary[key] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <p className="font-mono text-[9.5px] uppercase tracking-[.06em] text-zinc-500">Últimos 7 dias, por classificação</p>
        {(['priority', 'future_potential', 'out_of_profile'] as AgencyClassification[]).map((c) => (
          <span key={c} className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11.5px] text-zinc-300">
            {CLASSIFICATION_LABEL[c]}: <span className="font-semibold text-zinc-100">{weeklySummary[c] ?? 0}</span>
          </span>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <p className="font-mono text-[9.5px] uppercase tracking-[.06em] text-zinc-500">Taxas de conversão (últimos 7 dias)</p>
        <div className="mt-2 flex flex-wrap gap-4">
          {conversionRates.map((rate) => (
            <span key={rate.label} className="text-[12px] text-zinc-400">
              {rate.label}: <span className="font-semibold text-zinc-100">{rate.percent === null ? '—' : `${rate.percent}%`}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DistributionCard title="Por tamanho de equipe" buckets={teamSizeDistribution} />
        <DistributionCard title="Por artistas representados" buckets={artistsDistribution} />
        <DistributionCard title="Por localização (top 10)" buckets={locationDistribution} />
        <DistributionCard
          title="Por interesse"
          buckets={interestDistribution.map((b) => ({ label: INTEREST_LABEL[b.label as AgencyInterest] ?? b.label, count: b.count }))}
        />
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <FilterSelect name="classification" label="Classificação" defaultValue={params.classification} options={CLASSIFICATION_LABEL} />
        <FilterSelect name="status" label="Status" defaultValue={params.status} options={STATUS_LABEL} />
        <FilterSelect name="interest" label="Interesse" defaultValue={params.interest} options={INTEREST_LABEL} />
        <FilterInput name="city" label="Cidade" defaultValue={params.city} />
        <FilterInput name="country" label="País" defaultValue={params.country} />
        <FilterInput name="q" label="Buscar (agência, contato, e-mail)" defaultValue={params.q} wide />
        <button type="submit" className="rounded-lg bg-zinc-100 px-4 py-2 text-[12.5px] font-semibold text-zinc-900">
          Filtrar
        </button>
        {(params.classification || params.status || params.interest || params.city || params.country || params.q) && (
          <Link href="/admin/agencias" className="px-2 py-2 text-[12px] text-zinc-500 hover:text-zinc-200">
            Limpar
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-zinc-900 text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-normal">Agência</th>
              <th className="px-3 py-2 font-normal">Contato</th>
              <th className="px-3 py-2 font-normal">Local</th>
              <th className="px-3 py-2 font-normal">Equipe</th>
              <th className="px-3 py-2 font-normal">Artistas</th>
              <th className="px-3 py-2 font-normal">Volume/mês</th>
              <th className="px-3 py-2 font-normal">Classificação</th>
              <th className="px-3 py-2 font-normal">Status</th>
              <th className="px-3 py-2 font-normal">Notificação</th>
              <th className="px-3 py-2 font-normal">Inscrita em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-zinc-500">
                  Nenhuma inscrição encontrada.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-900">
                  <td className="px-3 py-2">
                    <Link href={`/admin/agencias/${row.id}`} className="text-zinc-100 underline-offset-2 hover:underline">
                      {row.agencyName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {row.contactName}
                    <br />
                    <span className="text-zinc-600">{row.contactEmail}</span>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {row.city}, {row.country}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{row.teamSize}</td>
                  <td className="px-3 py-2 text-zinc-400">{row.artistsRepresented}</td>
                  <td className="px-3 py-2 text-zinc-400">{row.monthlyRequestsVolume}</td>
                  <td className="px-3 py-2">
                    <ClassificationBadge classification={row.classification} />
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{STATUS_LABEL[row.status]}</td>
                  <td className="px-3 py-2 text-zinc-400">
                    {row.classification === 'priority' ? row.notificationStatus : '—'}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{new Date(row.createdAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DistributionCard({ title, buckets }: { title: string; buckets: { label: string; count: number }[] }) {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
      <p className="font-mono text-[9.5px] uppercase tracking-[.06em] text-zinc-500">{title}</p>
      {total === 0 ? (
        <p className="mt-2 text-[12px] text-zinc-600">Sem dados ainda.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {buckets.map((b) => (
            <li key={b.label} className="flex items-center justify-between text-[12px] text-zinc-400">
              <span>{b.label}</span>
              <span className="font-semibold text-zinc-100">{b.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClassificationBadge({ classification }: { classification: AgencyClassification }) {
  const color =
    classification === 'priority'
      ? 'border-red-500/40 text-red-300'
      : classification === 'future_potential'
        ? 'border-amber-500/40 text-amber-300'
        : 'border-zinc-700 text-zinc-500';
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${color}`}>{CLASSIFICATION_LABEL[classification]}</span>;
}

function FilterSelect({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: Record<string, string>;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
      {label}
      <select name={name} defaultValue={defaultValue ?? ''} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-[12.5px] text-zinc-100">
        <option value="">Todos</option>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterInput({ name, label, defaultValue, wide }: { name: string; label: string; defaultValue?: string; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-[11px] text-zinc-500 ${wide ? 'min-w-[220px] flex-1' : ''}`}>
      {label}
      <input
        type="text"
        name={name}
        defaultValue={defaultValue ?? ''}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-[12.5px] text-zinc-100 placeholder:text-zinc-600"
      />
    </label>
  );
}
