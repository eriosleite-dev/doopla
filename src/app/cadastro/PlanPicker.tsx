'use client';

import { useState } from 'react';

import { fieldInputClass } from '@/app/auth/ui';
import { MARKETS, TRIAL_DAYS, type PlanId } from '@/lib/market';

export const PLAN_CARDS: { id: PlanId; name: string; description: string; features: string[] }[] = [
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
  },
  {
    id: 'pro',
    name: 'Doopla Pro',
    description: 'Mais estrutura para fazer sua carreira crescer.',
    features: [
      'Bookings ilimitados',
      'Especialista humano se precisar',
      'Inteligência sobre cachês, clientes e negociações',
      'Materiais profissionais para sua carreira',
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
// Componente compartilhado entre o wizard antigo (cadastro de booker)
// e a nova tela dedicada "Escolha seu plano" (cadastro de artista,
// já autenticado) — uma única fonte de verdade pros dois cards, pra
// nunca desalinhar preço/feature entre os dois lugares.
export function PlanPicker({
  initialPlan,
  fieldName = 'artistPlan',
  onChange,
  showVoucherField = true,
}: {
  initialPlan: PlanId;
  fieldName?: string;
  onChange?: (plan: PlanId) => void;
  showVoucherField?: boolean;
}) {
  const [selected, setSelected] = useState<PlanId>(initialPlan);
  const [showVoucher, setShowVoucher] = useState(false);
  const market = MARKETS.BR;

  function choose(plan: PlanId) {
    setSelected(plan);
    onChange?.(plan);
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
