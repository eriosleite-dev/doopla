import Link from 'next/link';

import type { Subscription } from '@/lib/supabase/types';

import { proGhostButtonClass } from '../pro-format';
import { ProCard, ProPageHeader } from '../pro-ui';
import { ProWhatsappIdentityCard } from './pro-whatsapp-identity-card';

// Item 12/13 da revisão Professional Web Dashboard (06/09/2026) —
// Configurações deixa de ser o antigo Perfil (nome gigante serifado,
// cards brancos, formulário inteiro na raiz). Perfil profissional
// continua existindo como tela própria (/dashboard/perfil/editar,
// mesmos componentes reais de sempre: ArtistProfileForm/AvatarUploader/
// PublicProfileCard/LinkRoutingCard) — Configurações só aponta pra lá.
// Notificações/Segurança/Privacidade: só o que já é real hoje. Nenhum
// toggle funcional falso — backend genérico dessas 3 seções ainda não
// existe, registrado como pendência (não escondido).
export function ProConfiguracoesView({
  fullName,
  email,
  phone,
  subscription,
  whatsappStatus,
  whatsappNumber,
}: {
  fullName: string;
  email: string;
  phone: string | null;
  subscription: Subscription | null;
  whatsappStatus: string | null;
  whatsappNumber: string | null;
}) {
  const plan = subscription?.artist_plan ?? 'doopla';
  const isPro = plan === 'pro';
  const isTrialing = subscription?.status === 'trialing';
  const isCanceled = Boolean(subscription?.canceled_at);

  return (
    <main>
      <ProPageHeader title="Configurações" subtitle="Plano, conta, WhatsApp, segurança e preferências." />

      <div className="flex flex-col gap-3.5">
        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Plano e assinatura</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-[var(--pro-off)]">{isPro ? 'Doopla Pro' : 'Doopla Básico'}</p>
              <p className="mt-0.5 text-[12px] text-[var(--pro-tx-50)]">
                {isTrialing
                  ? `Período de teste${subscription?.trial_ends_at ? ` até ${new Date(subscription.trial_ends_at).toLocaleDateString('pt-BR')}` : ''}`
                  : isCanceled && subscription?.pro_period_ends_at
                    ? `Cancelado — continua ativo até ${new Date(subscription.pro_period_ends_at).toLocaleDateString('pt-BR')}`
                    : isPro
                      ? 'Ativo'
                      : 'Plano gratuito'}
              </p>
            </div>
            {!isPro && (
              <Link href="/precos" className={proGhostButtonClass}>
                Conhecer o Pro
              </Link>
            )}
          </div>
        </ProCard>

        <ProWhatsappIdentityCard status={whatsappStatus} verifiedNumber={whatsappNumber} />

        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Conta</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
            <dt className="text-[var(--pro-tx-50)]">Nome</dt>
            <dd className="text-[var(--pro-off)]">{fullName}</dd>
            <dt className="text-[var(--pro-tx-50)]">E-mail</dt>
            <dd className="text-[var(--pro-off)]">{email}</dd>
            {phone && (
              <>
                <dt className="text-[var(--pro-tx-50)]">Telefone de contato</dt>
                <dd className="text-[var(--pro-off)]">{phone}</dd>
              </>
            )}
          </dl>
        </ProCard>

        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Notificações</p>
          <p className="mt-2 text-[12.5px] text-[var(--pro-tx-50)]">
            Preferências de notificação ainda não são configuráveis — em breve.
          </p>
        </ProCard>

        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Segurança</p>
          <p className="mt-2 text-[12.5px] text-[var(--pro-tx-50)]">
            Seu WhatsApp verificado (acima) é o sinal de identidade usado hoje pela Doopla. Mais controles de segurança chegam em breve.
          </p>
        </ProCard>

        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Privacidade e dados</p>
          <p className="mt-2 text-[12.5px] text-[var(--pro-tx-50)]">
            Controles de privacidade e dados ainda não são configuráveis por aqui — em breve. (Diferente da privacidade do seu perfil na Comunidade, que tem tela própria.)
          </p>
        </ProCard>

        <ProCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-pro-sub text-[13.5px] font-bold">Perfil profissional</p>
            <Link href="/dashboard/perfil/editar" className={proGhostButtonClass}>
              Editar perfil profissional →
            </Link>
          </div>
        </ProCard>

        <ProCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-pro-sub text-[13.5px] font-bold">Dados de recebimento</p>
            <Link href="/dashboard/dinheiro" className={proGhostButtonClass}>
              Dados de recebimento →
            </Link>
          </div>
        </ProCard>
      </div>
    </main>
  );
}
