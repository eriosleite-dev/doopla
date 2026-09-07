'use client';

import { useState, type MouseEvent } from 'react';

import { fieldInputClass } from '@/app/auth/ui';
import { MARKETS, TRIAL_DAYS, type PlanId } from '@/lib/market';

// `moreFeatures` (07/09/2026) alimenta "Ver todos os recursos" — só com
// itens já 100% confirmados pelo produto (nada de "especialista
// humano"/"rede de bookers"/"benefícios de parceiros", conceitos
// antigos removidos das promessas), nunca o catálogo comercial final
// (ainda em auditoria/fechamento — ver PROGRESS.md). Pro reafirma "tudo
// do Básico" em vez de inventar exclusividade Pro nova, porque a
// camada Pro específica (e-mail de representação, analytics, materiais,
// automações, Booker/multi-role) ainda não tem matriz aprovada nem gate
// real implementado (hasDooplaPro() existe, zero call sites hoje).
export const PLAN_CARDS: {
  id: PlanId;
  name: string;
  description: string;
  features: string[];
  moreFeatures: string[];
}[] = [
  {
    id: 'doopla',
    name: 'Doopla',
    description: 'Sua Doopla trabalha com você.',
    features: [
      'Até 5 novos bookings por mês',
      'Sua Doopla atende, negocia e acompanha cada booking até o fechamento',
      'Contratos e acompanhamento de pagamentos',
      'Comunidade Doopla',
    ],
    moreFeatures: [
      'Negociação respeitando suas regras e aprovações',
      'Follow-up de cada negociação',
      'WhatsApp como canal principal com sua Doopla',
      'Perfil, link e canais de booking',
    ],
  },
  {
    id: 'pro',
    name: 'Doopla Pro',
    description: 'Mais estrutura para fazer sua carreira crescer.',
    features: [
      'Bookings ilimitados',
      'Inteligência sobre cachês, clientes e negociações',
      'Materiais profissionais para sua carreira',
    ],
    moreFeatures: [
      'Tudo o que vem no plano Básico',
      'Negociação respeitando suas regras e aprovações',
      'Follow-up de cada negociação',
      'WhatsApp como canal principal com sua Doopla',
      'Perfil, link e canais de booking',
    ],
  },
];

// Sem cobrança de verdade ainda (nenhum processador de pagamento
// integrado) — "confirmar assinatura" grava estado real no banco
// (subscriptions.artist_plan, migration 0036), não cobra cartão.
// 7 dias grátis, sem cartão, pros dois planos — a escolha aqui só
// marca qual plano a assinatura em trial já nasce apontando; o
// artista continua podendo trocar depois em Minha Doopla, antes do
// trial acabar. O voucher Founder (condição especial, nunca pública)
// é aplicado no próprio cadastro se um código válido for informado
// aqui.
//
// Componente compartilhado entre o wizard antigo (cadastro de booker,
// sistema visual --paper/--ink) e a nova etapa 7 do onboarding
// (sistema visual vermelho/cream do onboarding.css, escopado sob
// #onboarding) — variant escolhe qual CSS usar, mas os dois sempre
// leem os mesmos PLAN_CARDS, pra nunca desalinhar preço/feature entre
// os dois lugares.
export function PlanPicker({
  initialPlan,
  fieldName = 'artistPlan',
  onChange,
  showVoucherField = true,
  variant = 'legacy',
}: {
  initialPlan: PlanId;
  fieldName?: string;
  onChange?: (plan: PlanId) => void;
  showVoucherField?: boolean;
  variant?: 'legacy' | 'onboarding';
}) {
  const [selected, setSelected] = useState<PlanId>(initialPlan);
  const [showVoucher, setShowVoucher] = useState(false);
  // Quais cards têm "Ver todos os recursos" aberto — por id, não
  // exclusivo (dá pra expandir os dois planos ao mesmo tempo pra
  // comparar). Só usado pelo variant="onboarding".
  const [expanded, setExpanded] = useState<Set<PlanId>>(new Set());
  const market = MARKETS.BR;

  function choose(plan: PlanId) {
    setSelected(plan);
    onChange?.(plan);
  }

  function toggleExpanded(plan: PlanId, event: MouseEvent) {
    // stopPropagation: o botão fica DENTRO do card clicável (onClick
    // seleciona o plano) — expandir/recolher nunca deve mudar a seleção.
    event.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(plan)) next.delete(plan);
      else next.add(plan);
      return next;
    });
  }

  if (variant === 'onboarding') {
    return (
      <div>
        <input type="hidden" name={fieldName} value={selected} />
        {PLAN_CARDS.map((card) => {
          const isSelected = selected === card.id;
          const isExpanded = expanded.has(card.id);
          const detailsId = `plan-more-${card.id}`;
          return (
            <div
              key={card.id}
              className={`plan-card${isSelected ? ' selected' : ''}`}
              onClick={() => choose(card.id)}
            >
              {card.id === 'pro' && <div className="plan-tag">Mais completo</div>}
              <div className="plan-body">
                <div className="plan-head">
                  <span className="plan-name">{card.name}</span>
                  <span className="plan-price">
                    {market.currencySymbol}
                    {market.pricing[card.id].toFixed(2).replace('.', ',')}
                    <span>/mês</span>
                  </span>
                </div>
                <span className="plan-trial">{TRIAL_DAYS} dias grátis</span>
                <ul className="plan-feats">
                  {card.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>

                <button
                  type="button"
                  className="plan-more-toggle"
                  aria-expanded={isExpanded}
                  aria-controls={detailsId}
                  onClick={(e) => toggleExpanded(card.id, e)}
                >
                  {isExpanded ? 'Mostrar menos ↑' : 'Ver todos os recursos ↓'}
                </button>
                <ul
                  id={detailsId}
                  className={`plan-feats plan-more${isExpanded ? ' open' : ''}`}
                  aria-hidden={!isExpanded}
                >
                  {card.moreFeatures.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}

        {showVoucherField &&
          (showVoucher ? (
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="founderVoucherCode">Código do voucher Founder</label>
              <input type="text" id="founderVoucherCode" name="founderVoucherCode" placeholder="Ex: FOUNDER-ABC123" />
              <p className="hint">
                Se o código for válido, o preço mensal do seu plano fica travado nessa condição
                enquanto a assinatura continuar ativa.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowVoucher(true)}
              className="back-btn show"
              style={{ marginTop: 8 }}
            >
              Tenho um código de voucher Founder
            </button>
          ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name={fieldName} value={selected} />
      <p className="font-doopla-mono text-[11px] uppercase tracking-[.1em] text-[var(--ink)]/50">
        {TRIAL_DAYS} dias grátis, sem cartão, nos dois planos
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PLAN_CARDS.map((card) => {
          const isSelected = selected === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => choose(card.id)}
              className={`flex flex-col gap-3 rounded-2xl border p-5 text-left transition-colors ${
                isSelected
                  ? 'border-[var(--ink)] bg-[var(--paper-dim)]'
                  : 'border-[var(--ink)]/10 hover:border-[var(--ink)]/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-doopla-display text-lg font-semibold">{card.name}</span>
                {isSelected && (
                  <span className="font-doopla-mono rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink)]">
                    Selecionado
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-doopla-display text-2xl font-semibold text-[var(--accent-ink)]">
                  {market.currencySymbol}
                  {market.pricing[card.id].toFixed(2).replace('.', ',')}
                </span>
                <span className="text-sm text-[var(--ink)]/60">/mês</span>
              </div>
              <p className="text-sm text-[var(--ink)]/70">{card.description}</p>
              <ul className="flex flex-col gap-1.5 text-sm text-[var(--ink)]/75">
                {card.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {showVoucherField &&
        (showVoucher ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--ink)]/70">Código do voucher Founder</span>
            <input
              type="text"
              name="founderVoucherCode"
              placeholder="Ex: FOUNDER-ABC123"
              className={fieldInputClass}
            />
            <span className="text-xs text-[var(--ink)]/50">
              Se o código for válido, o preço mensal do seu plano fica travado nessa condição
              enquanto a assinatura continuar ativa.
            </span>
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setShowVoucher(true)}
            className="w-fit text-xs text-[var(--ink)]/50 underline underline-offset-2"
          >
            Tenho um código de voucher Founder
          </button>
        ))}
    </div>
  );
}
