import { logoutAction } from '@/app/auth/actions';
import type { Subscription } from '@/lib/supabase/types';

import { ProPageHeader } from '../pro-ui';
import { ProSettingsGroup, ProSettingsRow } from './settings-ui';

// Settings V2 (08/09/2026) — a raiz de Configurações responde rápido a
// "o que posso gerenciar?" e "qual é o estado atual?", nunca um
// formulário inteiro na própria raiz. Cada linha é uma rota própria
// (Configurações → detalhe → ação); o resumo ao lado de cada linha só
// aparece quando há dado real útil pra mostrar — nunca um placeholder
// decorativo. Server Component puro: nenhuma interação vive aqui, só
// navegação — as ações reais (upgrade, trocar senha, excluir conta)
// vivem nas subpáginas correspondentes.
export function ProConfiguracoesView({
  hasPro,
  subscription,
  whatsappStatus,
  paymentConfigured,
}: {
  hasPro: boolean;
  subscription: Subscription | null;
  whatsappStatus: string | null;
  paymentConfigured: boolean;
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

      <div className="flex flex-col gap-6">
        <ProSettingsGroup title="Assinatura e cobrança">
          <ProSettingsRow href="/dashboard/perfil/assinatura" label="Plano e assinatura" summary={planSummary} />
          <ProSettingsRow
            href="/dashboard/perfil/recebimento"
            label="Dados de recebimento"
            summary={paymentConfigured ? 'Configurados ✓' : 'Ainda não configurados'}
          />
        </ProSettingsGroup>

        <ProSettingsGroup title="Sua conta">
          <ProSettingsRow href="/dashboard/perfil/conta" label="Informações da conta" />
          <ProSettingsRow href="/dashboard/perfil/seguranca" label="Segurança e acesso" />
        </ProSettingsGroup>

        <ProSettingsGroup title="Doopla">
          <ProSettingsRow href="/dashboard/perfil/preferencias" label="Preferências da Doopla" />
          <ProSettingsRow href="/dashboard/perfil/notificacoes" label="Notificações" />
          <ProSettingsRow href="/dashboard/perfil/canais" label="Canais e conexões" summary={whatsappSummary} />
        </ProSettingsGroup>

        <ProSettingsGroup title="Privacidade e suporte">
          <ProSettingsRow href="/dashboard/perfil/privacidade" label="Privacidade e dados" />
          <ProSettingsRow href="/dashboard/perfil/suporte" label="Ajuda e suporte" />
        </ProSettingsGroup>

        <form action={logoutAction} className="px-1">
          <LogoutRow />
        </form>
      </div>
    </main>
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
