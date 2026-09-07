'use client';

import Link from 'next/link';
import { useState } from 'react';

import { hasDooplaPro } from '@/lib/subscription';
import type { Subscription } from '@/lib/supabase/types';

import { proGhostButtonClass } from '../pro-format';
import { ProCard, ProPageHeader } from '../pro-ui';
import { ProUpgradeModal } from '../pro-upgrade-modal';
import { ProWhatsappIdentityCard } from './pro-whatsapp-identity-card';

// Item 12/13 da revisão Professional Web Dashboard (06/09/2026) —
// Configurações deixa de ser o antigo Perfil (nome gigante serifado,
// cards brancos, formulário inteiro na raiz). Notificações/Segurança/
// Privacidade: só o que já é real hoje. Nenhum toggle funcional falso
// — backend genérico dessas 3 seções ainda não existe, registrado como
// pendência (não escondido).
//
// Rodada de correção/consistência (06/09/2026) — decisão explícita do
// usuário: "Perfil profissional" descontinuada como SUPERFÍCIE DE
// NAVEGAÇÃO do profissional (nenhum card/link daqui em diante). Os
// dados (`artist_profiles`) e o formulário real (ArtistProfileForm/
// AvatarUploader/PublicProfileCard/LinkRoutingCard,
// `/dashboard/perfil/editar`) continuam existindo intocados — só não
// são mais alcançáveis por nenhum link do painel profissional. Nunca
// deletar o formulário/rota "pra resolver UI"; a superfície futura de
// edição é um bloco separado, decisão do usuário, não deste patch.
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
  // Entitlement/situação (07/09/2026, migration 0074) — hasPro é a
  // ÚNICA autoridade sobre "tem Doopla Pro" (mesma function do Shell/
  // Home/Minha equipe/limite de bookings/selo da Comunidade): nunca
  // reler artist_plan sozinho aqui, senão trial expirado ou canceled
  // voltam a aparecer como Pro. O texto de situação abaixo é só
  // informativo sobre o ciclo (teste em andamento/encerrado, ativo,
  // cancelado) — nunca decide entitlement por conta própria.
  const hasPro = hasDooplaPro(subscription);
  const isTrialing = subscription?.status === 'trialing';
  const trialEndsAtLabel = subscription?.trial_ends_at
    ? new Date(subscription.trial_ends_at).toLocaleDateString('pt-BR')
    : null;
  const isCanceled = Boolean(subscription?.canceled_at);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  return (
    <main>
      <ProPageHeader title="Configurações" subtitle="Plano, conta, WhatsApp, segurança e preferências." />

      <div className="flex flex-col gap-3.5">
        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Plano e assinatura</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-[var(--pro-off)]">{hasPro ? 'Doopla Pro' : 'Doopla Básico'}</p>
              <p className="mt-0.5 text-[12px] text-[var(--pro-tx-50)]">
                {isTrialing
                  ? hasPro
                    ? `Período de teste${trialEndsAtLabel ? ` até ${trialEndsAtLabel}` : ''}`
                    : `Período de teste encerrado${trialEndsAtLabel ? ` em ${trialEndsAtLabel}` : ''}`
                  : isCanceled
                    ? 'Cancelado'
                    : hasPro
                      ? 'Ativo'
                      : 'Plano gratuito'}
              </p>
            </div>
            {!hasPro && (
              <button type="button" onClick={() => setUpgradeModalOpen(true)} className={proGhostButtonClass}>
                Conhecer o Pro
              </button>
            )}
          </div>
        </ProCard>

        <ProUpgradeModal open={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} context="geral" />

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
