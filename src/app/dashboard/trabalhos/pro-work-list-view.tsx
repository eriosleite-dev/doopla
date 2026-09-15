'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { formatCentsAsBRL } from '@/lib/format';

import { proGhostButtonClass, proPrimaryButtonClass, proStatusPillClass } from '../pro-format';
import { ProEmptyState } from '../pro-ui';
import { WORK_CHANNEL_LABEL, type WorkAttention, type WorkChannel, type WorkItem } from '../work-items';

// Bookings unificado (correção 15/09/2026, achado da fundadora) —
// substitui a barra permanente de chips (TODOS | PRECISA DE VOCÊ |
// EM NEGOCIAÇÃO | ...) por: busca + botão "Filtrar" (popover sob
// demanda, nunca um modal grande). Sem filtro nenhum aplicado, mostra
// só o que está ativo/relevante agora (precisa de você + em andamento
// + confirmados) — concluídos/cancelados só aparecem quando o
// profissional pede via filtro. Ordenação por urgência+relevância
// temporal já vem pronta de `buildWorkItems` (work-items.ts); este
// componente só busca/filtra em cima da ordem recebida, nunca reordena
// por conta própria.
const STATUS_OPTIONS: { value: WorkAttention; label: string }[] = [
  { value: 'precisa_de_voce', label: 'Precisa de você' },
  { value: 'em_andamento', label: 'Em negociação' },
  { value: 'confirmado', label: 'Confirmados' },
  { value: 'concluido', label: 'Concluídos' },
  { value: 'cancelado', label: 'Cancelados' },
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

type AppliedFilters = {
  status: WorkAttention[] | null;
  channel: WorkChannel[] | null;
  period: Period;
  customFrom: string | null;
  customTo: string | null;
};

const DEFAULT_VIEW_STATUS: WorkAttention[] = ['precisa_de_voce', 'em_andamento', 'confirmado'];
const NO_FILTERS: AppliedFilters = { status: null, channel: null, period: 'todos', customFrom: null, customTo: null };

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

function activeFilterCount(filters: AppliedFilters): number {
  let n = 0;
  if (filters.status) n += filters.status.length;
  if (filters.channel) n += filters.channel.length;
  if (filters.period !== 'todos') n += 1;
  return n;
}

function formatEventDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function ProWorkListView({ items }: { items: WorkItem[] }) {
  const [term, setTerm] = useState('');
  const [applied, setApplied] = useState<AppliedFilters>(NO_FILTERS);
  const [draft, setDraft] = useState<AppliedFilters>(NO_FILTERS);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function normalize(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  const normalizedTerm = normalize(term);
  const filtered = useMemo(() => {
    const statusSet = applied.status ? new Set(applied.status) : new Set(DEFAULT_VIEW_STATUS);
    const channelSet = applied.channel ? new Set(applied.channel) : null;
    return items.filter((item) => {
      if (!statusSet.has(item.attention)) return false;
      if (channelSet && !channelSet.has(item.channel)) return false;
      if (!matchesPeriod(item, applied)) return false;
      if (!normalizedTerm) return true;
      const text = normalize(`${item.clientName} ${item.summary} ${item.location ?? ''}`);
      return text.includes(normalizedTerm);
    });
  }, [items, applied, normalizedTerm]);

  function toggleDraftStatus(value: WorkAttention) {
    setDraft((d) => {
      const current = new Set(d.status ?? []);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      return { ...d, status: [...current] };
    });
  }

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
            className="w-full bg-transparent text-[13px] text-[var(--pro-off)] outline-none placeholder:text-[var(--pro-tx-30)]"
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

          {open && (
            <div className="absolute right-0 z-20 mt-2 w-[280px] rounded-[16px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-4 shadow-[0_20px_50px_rgba(0,0,0,.5)] backdrop-blur-xl sm:w-[320px]">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-doopla-mono text-[10.5px] uppercase tracking-[.06em] text-[var(--pro-tx-50)]">Status</p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {STATUS_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 text-[13px] text-[var(--pro-off)]">
                        <input
                          type="checkbox"
                          checked={(draft.status ?? []).includes(opt.value)}
                          onChange={() => toggleDraftStatus(opt.value)}
                          className="h-4 w-4 rounded border-[var(--pro-line)]"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

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
        <ProEmptyState message="Nenhum trabalho encontrado com esses filtros." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((item) => (
            <Link
              key={`${item.kind}-${item.id}`}
              href={item.href}
              className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-4 backdrop-blur-xl sm:flex-nowrap"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold text-[var(--pro-off)]">
                  {item.summary} <span className="font-normal text-[var(--pro-tx-50)]">· {item.clientName}</span>
                </p>
                <p className="font-doopla-mono mt-1 text-[10.5px] text-[var(--pro-tx-30)]">
                  {item.eventDate ? formatEventDate(item.eventDate) : 'Data a combinar'}
                  {item.location ? ` · ${item.location}` : ''}
                  {item.valueCents != null ? ` · ${formatCentsAsBRL(item.valueCents)}` : ''}
                </p>
                <p className="mt-1 text-[10.5px] text-[var(--pro-tx-30)]">{WORK_CHANNEL_LABEL[item.channel]}</p>
              </div>
              <span className={`flex-none ${proStatusPillClass(item.statusTone)}`}>{item.statusLabel}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
