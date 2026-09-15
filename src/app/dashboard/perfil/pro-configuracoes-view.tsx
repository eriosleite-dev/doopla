import Link from 'next/link';
import type { ReactNode } from 'react';

import { logoutAction } from '@/app/auth/actions';
import { SUPPORT_EMAIL } from '@/lib/support';
import type { LinkRoutingMode, Subscription } from '@/lib/supabase/types';

import type { BookerOption } from '../link-routing-form';
import { ProAccordion, ProCopyButton, ProPageHeader } from '../pro-ui';
import { ProLinkRoutingForm } from '../pro-link-routing-form';
import { DeleteAccountModal } from './delete-account-modal';
import { ProWhatsappIdentityCard } from './pro-whatsapp-identity-card';
import { ProSettingsRow } from './settings-ui';

// Settings V2 (08/09/2026), consolidado (09/09/2026), reestruturado em
// acordeão pro Beta (14/09/2026) — decisão da fundadora: Configurações
// vira uma lista de seções (acordeão, chevron claro, mesmo componente
// ProAccordion já usado na Home), não mais uma lista de linhas que só
// navegam. Só 3 seções continuam abrindo página própria por linha
// (Assinatura e cobrança, Sua conta, Perfil e trabalho) — fluxos
// genuinamente complexos (Stripe, reautenticação, formulários grandes)
// onde uma página dedicada com "← Configurações" ainda é a escolha
// certa. As outras 4 seções (Notificações, Canais da sua Doopla,
// Privacidade e dados, Ajuda e suporte) são pequenas o suficiente pra
// caber inline, dentro do próprio acordeão, sem navegação nenhuma —
// exatamente o pedido da fundadora de "menos perguntas, menos
// páginas, mais naturalidade".
//
// "Perfil público" saiu por completo (achado da auditoria de legado:
// vitrine pública não é produto atual) — a linha, a rota
// /dashboard/perfil/publico e o toggle Ativar/desativar não aparecem
// mais aqui. A rota em si não foi apagada (regra da fundadora: nunca
// apagar infraestrutura só pra esta tarefa de beta), só ficou
// inalcançável pela navegação normal.
//
// "Sua Doopla" saiu por completo (auditoria de legado, 15/09/2026):
// a única "configuração" que existia lá (WhatsApp/Painel/Ambos,
// attention_channel) nunca alterou comportamento real — nenhum código
// de notificação/WhatsApp a lia, só existia como UI. Decisão canônica
// da fundadora: "Precisa de você" é comportamento canônico do produto,
// não preferência configurável — o painel sempre reflete pendência,
// independente de canal. Coluna/action/componente preservados
// (attention_channel, updateAttentionChannelAction,
// AttentionChannelForm) — só a superfície de Configurações foi
// desconectada, nada apagado.
//
// "Privacidade e dados" simplificada (auditoria de legado, 15/09/2026):
// "Seus dados" (placeholder "em breve", zero infra de exportação por
// trás) e os 7 toggles de "Privacidade na Comunidade" saíram daqui.
// Auditoria confirmou que NENHUM dos 7 (cidade/foto/bio/especialidades/
// tipos de trabalho/Instagram/portfólio) tem efeito visível hoje — a
// view `community_profiles_public` já aplica a regra no servidor, mas
// `CommunityAuthorSnapshot` (o tipo que a UI da Comunidade de fato usa)
// só carrega profileId/displayName/professionLabel/isPro/isIncomplete/
// city/state/avatarUrl/publicId; nenhum componente da Comunidade
// renderiza bio/specialties/workTypes/instagramUrl/portfolioUrl, e
// city/avatarUrl também não aparecem em lugar nenhum. 2 dos 7
// (especialidades/tipos de trabalho) ainda dependiam de `genres`/
// `work_types` — colunas sem superfície de edição desde a
// simplificação de "Perfil e trabalho". Schema/RLS/RPC/`community_profiles`/
// `community_profiles_public`/`CommunityPrivacyForm`/regra de ativação
// (`ensureCommunityProfileActivated`, disparada ao visitar qualquer
// página real da Comunidade — nunca dependeu deste formulário)
// preservados, só a superfície de Configurações desconectada. Quando a
// Comunidade passar a exibir esses campos de verdade, revisar quais
// controles voltam.
export function ProConfiguracoesView({
  hasPro,
  subscription,
  whatsappStatus,
  whatsappVerifiedNumber,
  paymentConfigured,
  bookers,
  linkRoutingMode,
  linkRoutingBookerId,
  orcamentoUrl,
}: {
  hasPro: boolean;
  subscription: Subscription | null;
  whatsappStatus: string | null;
  whatsappVerifiedNumber: string | null;
  paymentConfigured: boolean;
  bookers: BookerOption[];
  linkRoutingMode: LinkRoutingMode;
  linkRoutingBookerId: string | null;
  orcamentoUrl: string | null;
}) {
  const isTrialing = subscription?.status === 'trialing';
  const isCanceled = Boolean(subscription?.canceled_at);
  const planSummary = isTrialing
    ? hasPro
      ? 'Pro · teste'
      : 'Teste encerrado'
    : isCanceled
      ? 'Cancelado'
      : hasPro
        ? 'Pro'
        : 'Básico';

  const whatsappSummary = whatsappStatus === 'verified' ? 'Verificado' : 'Não verificado';

  return (
    <main>
      <ProPageHeader title="Configurações" subtitle="Gerencie sua conta, assinatura e preferências da Doopla." />

      <div className="flex flex-col">
        <ProAccordion title="Assinatura e cobrança" rightBadge={<span className="text-[12px] text-[var(--pro-tx-50)]">{planSummary}</span>}>
          <RowList>
            <ProSettingsRow href="/dashboard/perfil/assinatura" label="Plano e assinatura" summary={planSummary} />
            <ProSettingsRow
              href="/dashboard/perfil/recebimento"
              label="Dados de recebimento"
              summary={paymentConfigured ? 'Configurados ✓' : 'Ainda não configurados'}
            />
          </RowList>
        </ProAccordion>

        <ProAccordion title="Sua conta">
          <RowList>
            <ProSettingsRow href="/dashboard/perfil/conta" label="Informações da conta" />
            <ProSettingsRow href="/dashboard/perfil/seguranca" label="Segurança e acesso" />
          </RowList>
        </ProAccordion>

        <ProAccordion title="Perfil e trabalho">
          {/* Redesign 15/09/2026 — "Dados profissionais" e "Como você
              trabalha" eram 2 rotas separadas sob este mesmo accordion;
              unificadas numa página só (/dashboard/perfil/dados, 3
              grupos: Informações profissionais / Seu trabalho / Valores
              e condições), então este accordion agora tem 1 destino só. */}
          <RowList>
            <ProSettingsRow href="/dashboard/perfil/dados" label="Editar perfil e trabalho" />
          </RowList>
        </ProAccordion>

        <ProAccordion title="Notificações">
          <div className="flex flex-col gap-2">
            <p className="text-[12.5px] text-[var(--pro-tx-50)]">
              Você recebe notificações de respostas e menções na Comunidade pelo sino, dentro do painel. Preferências de
              canal (e-mail, WhatsApp) ainda não existem — em breve.
            </p>
            <Link href="/dashboard/comunidade" className="text-[12.5px] font-semibold text-[var(--pro-red)] hover:underline">
              Ver Comunidade
            </Link>
          </div>
        </ProAccordion>

        <ProAccordion title="Canais da sua Doopla" rightBadge={<span className="text-[12px] text-[var(--pro-tx-50)]">{whatsappSummary}</span>}>
          <div className="flex flex-col gap-3.5">
            <p className="text-[12.5px] text-[var(--pro-tx-50)]">
              A porta de entrada pro cliente iniciar um booking com você — não é um perfil público.
            </p>
            <ProWhatsappIdentityCard status={whatsappStatus} verifiedNumber={whatsappVerifiedNumber} />
            <OrcamentoLinkCard orcamentoUrl={orcamentoUrl} />
            <div>
              <p className="font-pro-sub text-[13.5px] font-bold">Quem recebe seus pedidos de orçamento</p>
              <div className="mt-3">
                <ProLinkRoutingForm bookers={bookers} currentMode={linkRoutingMode} currentBookerId={linkRoutingBookerId} />
              </div>
            </div>
          </div>
        </ProAccordion>

        <ProAccordion title="Privacidade e dados">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Link href="/privacidade" className="text-[12.5px] font-semibold text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]">
                Política de privacidade
              </Link>
              <span className="text-[var(--pro-tx-30)]">·</span>
              <Link href="/termos" className="text-[12.5px] font-semibold text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]">
                Termos de uso
              </Link>
            </div>

            <div className="border-t border-[var(--pro-line)] pt-4">
              <DeleteAccountModal />
            </div>
          </div>
        </ProAccordion>

        <ProAccordion title="Ajuda e suporte">
          <div className="flex flex-col gap-2">
            <p className="text-[12.5px] text-[var(--pro-tx-50)]">
              Problema com sua conta, assinatura ou o painel? Isso é diferente de &ldquo;Falar com minha Doopla&rdquo;
              (sua representante, na Home) — aqui é sobre o produto em si.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="self-start rounded-full bg-[var(--pro-red)] px-4 py-2 text-[12.5px] font-semibold text-white"
            >
              Enviar e-mail para o suporte
            </a>
          </div>
        </ProAccordion>

        <form action={logoutAction} className="mt-2 px-1">
          <LogoutRow />
        </form>
      </div>
    </main>
  );
}

function RowList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-[var(--pro-line)] rounded-[14px] border border-[var(--pro-line)] bg-white/[0.02]">
      {children}
    </div>
  );
}

function OrcamentoLinkCard({ orcamentoUrl }: { orcamentoUrl: string | null }) {
  if (!orcamentoUrl) return null;
  return (
    <div>
      <p className="font-pro-sub text-[13.5px] font-bold">Seu link de orçamento</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed border-[var(--pro-line)] bg-white/[0.03] p-3.5">
        <span className="font-doopla-mono text-[12.5px] text-[var(--pro-off)]">{orcamentoUrl}</span>
        <ProCopyButton value={orcamentoUrl} label="Copiar link" />
      </div>
    </div>
  );
}

function LogoutRow() {
  return (
    <button
      type="submit"
      className="w-full rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] px-5 py-3.5 text-left text-[13.5px] font-medium text-[var(--pro-red)] backdrop-blur-xl transition-colors hover:bg-white/[0.03]"
    >
      Sair da conta
    </button>
  );
}
