import Link from 'next/link';
import type { ReactNode } from 'react';

import { logoutAction } from '@/app/auth/actions';
import { SUPPORT_EMAIL } from '@/lib/support';
import type { Subscription } from '@/lib/supabase/types';

import { ProAccordion, ProCopyButton, ProPageHeader } from '../pro-ui';
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
//
// "Canais da sua Doopla" redesenhada (auditoria de legado, 15/09/2026):
// princípio da fundadora — não é tela de integrações, não é tela de
// Booker, não é tela técnica: só "como um cliente chega até a Doopla
// desse profissional". "Quem recebe seus pedidos de orçamento"
// (ProLinkRoutingForm, roteamento pro Booker) saiu daqui — Booker é
// produto/role separado, tratado em outro bloco, não uma configuração
// dentro do Professional. `artist_link_routing`, `updateLinkRoutingAction`
// e `ProLinkRoutingForm` continuam intactos (só perderam este caller;
// `getArtistBookers`/`getArtistLinkRouting` só deixaram de ser
// chamados por `page.tsx` aqui — seguem existindo em `../data.ts`).
// No lugar, "WhatsApp da Doopla" (número oficial, `whatsappPublicNumber()`,
// nunca hardcoded) ganhou um segundo elemento: "Seu código"
// (`profiles.slug` — o MESMO identificador já usado no link de booking
// e no token do WhatsApp inbound, `extractDooplaSlugToken`; nenhuma
// coluna/RPC/identificador novo foi criado). "Seu link de orçamento"
// virou "Seu link de booking" (só copy — mesma URL `/orcamento/[slug]`,
// mesma action, mesmo tracking de origem, intocados).
//
// "Dados de recebimento" saiu daqui (auditoria de Financeiro,
// 15/09/2026) — Financeiro (`/dashboard/dinheiro`) passou a ser a
// ÚNICA superfície canônica pra esse formulário; existia nos dois
// lugares (mesmo componente `PaymentDetailsFields`/mesma action, só
// duplicação de navegação). `paymentConfigured` removido da
// assinatura — só existia pra alimentar essa linha. `/dashboard/perfil/recebimento`
// vira redirect pra `/dashboard/dinheiro`.
//
// "Ajuda e suporte" simplificada (auditoria de legado, 15/09/2026) —
// só FAQ + Suporte, nada mais. FAQ aponta pro `#faq` real (já existe
// na Home, `src/app/_home/home.html` — nunca duplicado/reescrito
// aqui, só linkado como destino; `/ajuda` continua intocada, é um
// stub do universo Home/site, fora de escopo). Suporte usa
// `SUPPORT_EMAIL` (`src/lib/support.ts`), única fonte no Web — nenhum
// hardcode novo. Travessão removido da copy.
export function ProConfiguracoesView({
  hasPro,
  subscription,
  whatsappStatus,
  whatsappVerifiedNumber,
  orcamentoUrl,
  professionalSlug,
  whatsappNumber,
}: {
  hasPro: boolean;
  subscription: Subscription | null;
  whatsappStatus: string | null;
  whatsappVerifiedNumber: string | null;
  orcamentoUrl: string | null;
  professionalSlug: string | null;
  whatsappNumber: string | null;
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
              Escolha como colocar sua Doopla em contato com um cliente.
            </p>
            <DooplaWhatsappAndCodeCard whatsappNumber={whatsappNumber} professionalSlug={professionalSlug} />
            <BookingLinkCard orcamentoUrl={orcamentoUrl} />
            <ProWhatsappIdentityCard status={whatsappStatus} verifiedNumber={whatsappVerifiedNumber} />
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
          <div className="flex flex-col gap-4">
            <p className="text-[12.5px] text-[var(--pro-tx-50)]">Precisa de ajuda com a Doopla? Estamos aqui para ajudar.</p>

            <div>
              <p className="font-pro-sub text-[13.5px] font-bold">FAQ</p>
              <Link
                href="/#faq"
                className="mt-2 inline-block self-start rounded-full border border-[var(--pro-line)] px-4 py-2 text-[12.5px] font-semibold text-[var(--pro-off)]"
              >
                Ver FAQ
              </Link>
            </div>

            <div>
              <p className="font-pro-sub text-[13.5px] font-bold">Suporte</p>
              <p className="mt-1 text-[12.5px] text-[var(--pro-tx-50)]">{SUPPORT_EMAIL}</p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="mt-2 inline-block self-start rounded-full bg-[var(--pro-red)] px-4 py-2 text-[12.5px] font-semibold text-white"
              >
                Enviar e-mail para o suporte
              </a>
            </div>
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

// "WhatsApp da Doopla" (número oficial, whatsappPublicNumber() —
// nunca hardcoded, estado honesto "Em configuração" quando a env não
// está setada) + "Seu código" (profiles.slug, o MESMO identificador
// já usado em /orcamento/[slug] e no token do WhatsApp inbound —
// nenhum identificador novo). O código não depende do número estar
// configurado: é um dado próprio e estável do profissional, sempre
// disponível assim que existe (ensurePublicId garante isso desde a
// primeira visita ao painel).
function DooplaWhatsappAndCodeCard({
  whatsappNumber,
  professionalSlug,
}: {
  whatsappNumber: string | null;
  professionalSlug: string | null;
}) {
  return (
    <div>
      <p className="font-pro-sub text-[13.5px] font-bold">WhatsApp da Doopla</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed border-[var(--pro-line)] bg-white/[0.03] p-3.5">
        {whatsappNumber ? (
          <span className="font-doopla-mono text-[12.5px] text-[var(--pro-off)]">{whatsappNumber}</span>
        ) : (
          <span className="font-doopla-mono text-[12.5px] text-[var(--pro-tx-30)]">Em configuração</span>
        )}
        {whatsappNumber && <ProCopyButton value={whatsappNumber} label="Copiar número" />}
      </div>

      {professionalSlug && (
        <div className="mt-3">
          <p className="text-[12.5px] text-[var(--pro-tx-50)]">Vai passar este número para um cliente?</p>
          <p className="mt-1 text-[12.5px] font-semibold text-[var(--pro-off)]">Envie também seu código:</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed border-[var(--pro-line)] bg-white/[0.03] p-3.5">
            <span className="font-doopla-mono text-[12.5px] text-[var(--pro-off)]">{professionalSlug}</span>
            <ProCopyButton value={professionalSlug} label="Copiar código" />
          </div>
          <p className="mt-1.5 text-[11.5px] text-[var(--pro-tx-50)]">Assim sua Doopla sabe que o cliente veio falar com você.</p>
        </div>
      )}
    </div>
  );
}

// Renomeado de "Seu link de orçamento" (copy, 15/09/2026) — mesma URL
// /orcamento/[slug], mesma action/RPC/tracking de origin/channel,
// intocados.
function BookingLinkCard({ orcamentoUrl }: { orcamentoUrl: string | null }) {
  if (!orcamentoUrl) return null;
  return (
    <div>
      <p className="font-pro-sub text-[13.5px] font-bold">Seu link de booking</p>
      <p className="mt-1 text-[12.5px] text-[var(--pro-tx-50)]">
        Compartilhe este link e o cliente já começa o pedido conectado a você.
      </p>
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
