'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { formatCentsAsBRL } from '@/lib/format';

import { capitalizeFirstLetter, capitalizeName, proGhostButtonClass, proPrimaryButtonClass, proStatusPillClass } from '../pro-format';
import { ProEmptyState } from '../pro-ui';
import { WORK_STAGE_LABEL, type WorkChannel, type WorkItem, type WorkStage } from '../work-items';

// Arquitetura de Bookings alto-volume (aprovada pela fundadora,
// 30/09/2026) — tabs SEMPRE visíveis (Em negociação | Confirmados |
// Concluídos | Todos) substituem o filtro de status como navegação
// PRINCIPAL — nunca um dropdown. `stage` vem pronto de `WorkItem`
// (work-items.ts), derivado só do status real — esta tela só filtra
// em cima dele, nunca reclassifica. "Filtrar" (popover) continua
// existindo pra filtros secundários: origem, período, contrato e o
// status especial "cancelados/recusados" (stage='outro', sem tab
// própria por pedido explícito — fica escondido até o profissional
// pedir via filtro, mesmo princípio do antigo DEFAULT_VIEW_STATUS).
type TabValue = WorkStage | 'todos';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'negociacao', label: 'Em negociação' },
  { value: 'confirmado', label: 'Confirmados' },
  { value: 'concluido', label: 'Concluídos' },
  { value: 'todos', label: 'Todos' },
];

// Só os canais com integração real hoje (achado da fundadora: "não
// mostrar opção falsa/inoperante no beta") — só WhatsApp tem
// integração de canal de verdade (src/lib/channels/whatsapp);
// e-mail entra aqui no dia em que existir de fato.
const CHANNEL_OPTIONS: { value: WorkChannel; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'public_link', label: 'Link de booking' },
];

type Period = 'todos' | 'proximos' | 'este_mes' | 'personalizado';
// Filtro de Contrato (auditoria de Booking Detail/Contratos,
// 15/09/2026) — só reflete WorkItem.hasContract (bookings.contract_url
// real), nunca um contract_type/distinção Padrão Doopla × Externo
// (o backend não tem essa distinção confiável hoje).
type ContractFilter = 'todos' | 'com' | 'sem';

type AppliedFilters = {
  channel: WorkChannel[] | null;
  period: Period;
  customFrom: string | null;
  customTo: string | null;
  contract: ContractFilter;
  // "Status especiais" (item 1 da fundadora, 30/09/2026) — recusada/
  // cancelada (bookings) e cancelada/booker_selecionado (pedidos) não
  // têm tab própria. Escondido por padrão em TODAS as tabs, inclusive
  // "Todos" — só aparece quando a pessoa pede explicitamente aqui.
  showOutros: boolean;
};

const NO_FILTERS: AppliedFilters = {
  channel: null,
  period: 'todos',
  customFrom: null,
  customTo: null,
  contract: 'todos',
  showOutros: false,
};

function isTodayOrAfter(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${dateStr}T00:00:00`) >= today;
}

function isThisMonth(dateStr: string): boolean {
  const d = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function matchesPeriod(item: WorkItem, filters: AppliedFilters): boolean {
  if (filters.period === 'todos') return true;
  if (!item.eventDate) return false;
  if (filters.period === 'proximos') return isTodayOrAfter(item.eventDate);
  if (filters.period === 'este_mes') return isThisMonth(item.eventDate);
  if (filters.period === 'personalizado') {
    if (filters.customFrom && item.eventDate < filters.customFrom) return false;
    if (filters.customTo && item.eventDate > filters.customTo) return false;
    return true;
  }
  return true;
}

function matchesContract(item: WorkItem, filters: AppliedFilters): boolean {
  if (filters.contract === 'todos') return true;
  if (filters.contract === 'com') return item.hasContract;
  return !item.hasContract;
}

function activeFilterCount(filters: AppliedFilters): number {
  let n = 0;
  if (filters.channel) n += filters.channel.length;
  if (filters.period !== 'todos') n += 1;
  if (filters.contract !== 'todos') n += 1;
  if (filters.showOutros) n += 1;
  return n;
}

function formatEventDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function ProWorkListView({ items }: { items: WorkItem[] }) {
  const [tab, setTab] = useState<TabValue>('negociacao');
  const [term, setTerm] = useState('');
  const [applied, setApplied] = useState<AppliedFilters>(NO_FILTERS);
  const [draft, setDraft] = useState<AppliedFilters>(NO_FILTERS);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const normalizedTerm = normalize(term);

  // Busca + filtros secundários, SEM a tab — base pra calcular a
  // contagem de cada tab (o que ela mostraria se fosse clicada agora,
  // com a busca/filtro atual já aplicados) e pra filtrar a lista final.
  const baseFiltered = useMemo(() => {
    const channelSet = applied.channel ? new Set(applied.channel) : null;
    return items.filter((item) => {
      if (channelSet && !channelSet.has(item.channel)) return false;
      if (!matchesPeriod(item, applied)) return false;
      if (!matchesContract(item, applied)) return false;
      if (!normalizedTerm) return true;
      const text = normalize(`${item.clientName} ${item.summary} ${item.location ?? ''}`);
      return text.includes(normalizedTerm);
    });
  }, [items, applied, normalizedTerm]);

  const stageCounts = useMemo(() => {
    const counts: Record<WorkStage, number> = { negociacao: 0, confirmado: 0, concluido: 0, outro: 0 };
    for (const item of baseFiltered) counts[item.stage] += 1;
    return counts;
  }, [baseFiltered]);

  const todosCount = stageCounts.negociacao + stageCounts.confirmado + stageCounts.concluido + (applied.showOutros ? stageCounts.outro : 0);

  const filtered = useMemo(() => {
    if (tab === 'todos') return baseFiltered.filter((item) => item.stage !== 'outro' || applied.showOutros);
    return baseFiltered.filter((item) => item.stage === tab);
  }, [baseFiltered, tab, applied.showOutros]);

  // Banner de atenção (item 4, fundadora) — conta SÓ bookings
  // formalizados (kind==='booking'), nunca DecisionItems/pedidos ainda
  // em conversa. needsYou de booking já é um sinal real e confiável
  // (classifyBookingAttention, independente de Approval Engine) — nada
  // inventado aqui. Sobre o total (`items`), não sobre a busca/filtro
  // atual: é um indicador global, não deveria sumir só porque a pessoa
  // está filtrando outra coisa.
  const bookingsNeedingYouCount = useMemo(
    () => items.filter((item) => item.kind === 'booking' && item.needsYou).length,
    [items]
  );

  function toggleDraftChannel(value: WorkChannel) {
    setDraft((d) => {
      const current = new Set(d.channel ?? []);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      return { ...d, channel: [...current] };
    });
  }

  const count = activeFilterCount(applied);

  return (
    <div className="flex flex-col gap-4">
      {bookingsNeedingYouCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[var(--pro-red)]/40 bg-[var(--pro-red)]/10 px-4 py-3">
          <p className="font-pro-sub text-[13px] font-bold text-[var(--pro-off)]">
            {bookingsNeedingYouCount} {bookingsNeedingYouCount === 1 ? 'booking precisa' : 'bookings precisam'} de você
          </p>
          <button
            type="button"
            onClick={() => {
              setTab('todos');
              listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="font-doopla-mono text-[11px] font-bold uppercase tracking-[.04em] text-[var(--pro-red)] underline"
          >
            Ver pendências
          </button>
        </div>
      )}

      <div ref={listTopRef} className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const tabCount = t.value === 'todos' ? todosCount : stageCounts[t.value];
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`font-pro-sub flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-bold transition-colors ${
                active
                  ? 'border-[var(--pro-red)] bg-[var(--pro-red)]/15 text-[var(--pro-red)]'
                  : 'border-[var(--pro-line)] text-[var(--pro-tx-70)] hover:border-[var(--pro-off)]/40 hover:text-[var(--pro-off)]'
              }`}
            >
              {t.label}
              {tabCount > 0 && (
                <span className="font-doopla-mono text-[10.5px] opacity-70">{tabCount}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] px-4 py-2.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none text-[var(--pro-tx-50)]">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar cliente, trabalho, local..."
            className="w-full bg-transparent text-[13px] text-[var(--pro-off)] outline-none placeholder:text-[var(--pro-tx-50)]"
          />
        </div>

        <div className="relative flex-none" ref={popoverRef}>
          <button
            type="button"
            onClick={() => {
              setDraft(applied);
              setOpen((o) => !o);
            }}
            className={`font-pro-sub flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-bold transition-colors ${
              count > 0
                ? 'border-[var(--pro-red)] text-[var(--pro-red)]'
                : 'border-[var(--pro-line)] text-[var(--pro-tx-70)] hover:border-[var(--pro-off)]/40 hover:text-[var(--pro-off)]'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            {count > 0 ? `Filtrar (${count})` : 'Filtrar'}
          </button>

          {/* bg sólido (achado QA visual, 15/09/2026) — --pro-panel translúcido
              (4% branco) + backdrop-blur deixava os cards/badges da lista logo
              atrás visíveis por trás do popover, como se fizessem parte dele.
              --pro-panel-solid já é o padrão usado por todo overlay flutuante
              do sistema Pro (NotificationBell, menus de Comunidade) — mesmo
              tratamento aqui, sem inventar nova superfície. */}
          {open && (
            <div className="absolute right-0 z-20 mt-2 w-[280px] rounded-[16px] border border-[var(--pro-line)] bg-[var(--pro-panel-solid)] p-4 shadow-[0_20px_50px_rgba(0,0,0,.5)] sm:w-[320px]">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-doopla-mono text-[10.5px] uppercase tracking-[.06em] text-[var(--pro-tx-50)]">Origem</p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {CHANNEL_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 text-[13px] text-[var(--pro-off)]">
                        <input
                          type="checkbox"
                          checked={(draft.channel ?? []).includes(opt.value)}
                          onChange={() => toggleDraftChannel(opt.value)}
                          className="h-4 w-4 rounded border-[var(--pro-line)]"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="font-doopla-mono text-[10.5px] uppercase tracking-[.06em] text-[var(--pro-tx-50)]">Período</p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {(
                      [
                        { value: 'todos', label: 'Todos' },
                        { value: 'proximos', label: 'Próximos' },
                        { value: 'este_mes', label: 'Este mês' },
                        { value: 'personalizado', label: 'Personalizado' },
                      ] as { value: Period; label: string }[]
                    ).map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 text-[13px] text-[var(--pro-off)]">
                        <input
                          type="radio"
                          name="periodo"
                          checked={draft.period === opt.value}
                          onChange={() => setDraft((d) => ({ ...d, period: opt.value }))}
                          className="h-4 w-4 border-[var(--pro-line)]"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  {draft.period === 'personalizado' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="date"
                        value={draft.customFrom ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, customFrom: e.target.value || null }))}
                        className="w-full rounded-[10px] border border-[var(--pro-line)] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-[var(--pro-off)] outline-none"
                      />
                      <span className="text-[var(--pro-tx-30)]">–</span>
                      <input
                        type="date"
                        value={draft.customTo ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, customTo: e.target.value || null }))}
                        className="w-full rounded-[10px] border border-[var(--pro-line)] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-[var(--pro-off)] outline-none"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <p className="font-doopla-mono text-[10.5px] uppercase tracking-[.06em] text-[var(--pro-tx-50)]">Contrato</p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {(
                      [
                        { value: 'todos', label: 'Todos' },
                        { value: 'com', label: 'Com contrato' },
                        { value: 'sem', label: 'Sem contrato' },
                      ] as { value: ContractFilter; label: string }[]
                    ).map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 text-[13px] text-[var(--pro-off)]">
                        <input
                          type="radio"
                          name="contrato"
                          checked={draft.contract === opt.value}
                          onChange={() => setDraft((d) => ({ ...d, contract: opt.value }))}
                          className="h-4 w-4 border-[var(--pro-line)]"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="font-doopla-mono text-[10.5px] uppercase tracking-[.06em] text-[var(--pro-tx-50)]">Status especiais</p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <label className="flex items-center gap-2 text-[13px] text-[var(--pro-off)]">
                      <input
                        type="checkbox"
                        checked={draft.showOutros}
                        onChange={() => setDraft((d) => ({ ...d, showOutros: !d.showOutros }))}
                        className="h-4 w-4 rounded border-[var(--pro-line)]"
                      />
                      Mostrar cancelados/recusados
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[var(--pro-line)] pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(NO_FILTERS);
                      setApplied(NO_FILTERS);
                      setOpen(false);
                    }}
                    className={proGhostButtonClass}
                  >
                    Limpar filtros
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setApplied(draft);
                      setOpen(false);
                    }}
                    className={proPrimaryButtonClass}
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <ProEmptyState
          message={
            items.length === 0
              ? 'Nenhum trabalho ainda.'
              : `Nenhum trabalho em "${tab === 'todos' ? 'Todos' : WORK_STAGE_LABEL[tab]}" com esses filtros.`
          }
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map((item) => (
            <BookingRowCompact key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// Linha compacta (item 2, fundadora, 30/09/2026) — escala pra
// dezenas/centenas de itens: 2 linhas no máximo, sem backdrop-blur por
// item (custo de renderização real em listas grandes, sem ganho visual
// que justifique numa linha única). "Precisa de você" é um badge
// adicional, nunca substitui o status real do item — os dois pills
// aparecem lado a lado. Clicar em qualquer ponto da linha (inclusive
// sobre o badge) leva pro mesmo destino interno (`item.href` — nunca
// WhatsApp): pra booking, é a rota que agora abre como drawer lateral
// (ver @modal/(.)bookings/[id]); pra pedido, a página de detalhe de
// sempre, onde a decisão pendente já é tratada dentro da Doopla.
function BookingRowCompact({ item }: { item: WorkItem }) {
  // Bookings abrem no drawer lateral (aprovado pela fundadora,
  // 30/09/2026) via um alias dedicado (/ver) interceptado só a partir
  // daqui — ver booking-drawer-shell.tsx e @modal/(.)bookings/[id]/ver
  // pro motivo de não interceptar a URL canônica do booking
  // diretamente (usada hoje por TrabalhosList do Booker em página
  // cheia, fora do escopo desta sessão). Pedido (kind='pedido') não
  // tem rota de drawer — segue pra página de detalhe de sempre.
  const href = item.kind === 'booking' ? `${item.href}/ver` : item.href;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[12px] border border-[var(--pro-line)] bg-[var(--pro-panel)] px-4 py-3 transition-colors hover:border-[var(--pro-off)]/30"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-[var(--pro-off)]">
          {capitalizeFirstLetter(item.summary)}{' '}
          <span className="font-normal text-[var(--pro-off)]">· {capitalizeName(item.clientName)}</span>
        </p>
        <p className="font-doopla-mono mt-0.5 truncate text-[10.5px] text-[var(--pro-tx-50)]">
          {item.eventDate ? formatEventDate(item.eventDate) : 'Data a combinar'}
          {item.location ? ` · ${capitalizeName(item.location)}` : ''}
          {item.valueCents != null ? ` · ${formatCentsAsBRL(item.valueCents)}` : ''}
        </p>
      </div>
      <div className="flex flex-none items-center gap-2">
        {item.needsYou && (
          <span className="font-doopla-mono rounded-full bg-[var(--pro-red)]/15 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[.03em] text-[var(--pro-red)]">
            Precisa de você
          </span>
        )}
        <span className={proStatusPillClass(item.statusTone)}>{item.statusLabel}</span>
      </div>
    </Link>
  );
}
