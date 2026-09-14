import type { Metadata } from 'next';
import Link from 'next/link';

import { proGhostButtonClass } from '../../pro-format';
import { ProCard } from '../../pro-ui';
import { ProSettingsDetailHeader } from '../settings-ui';

export const metadata: Metadata = {
  title: 'Notificações | Doopla',
};

// Settings V2 (08/09/2026) — auditado antes de codar: hoje só existe
// notificação real de Comunidade (sino, community_notifications,
// migration 0059), decisão explícita de escopo "V1 = só Comunidade"
// (DECISOES.md). Nenhum canal de entrega configurável existe fora
// disso — não inventamos toggle de e-mail/push/WhatsApp pra
// notificação sem infraestrutura real por trás. Evento (o que gera uma
// notificação) e canal de entrega (como ela chega) continuam sendo
// conceitos diferentes: hoje só existe o canal "dentro do painel".
export default function NotificacoesPage() {
  return (
    <main>
      <ProSettingsDetailHeader title="Notificações" />

      <ProCard>
        <p className="font-pro-sub text-[13.5px] font-bold">Comunidade</p>
        <p className="mt-1.5 text-[12.5px] text-[var(--pro-tx-50)]">
          Você recebe notificações de respostas e menções na Comunidade pelo sino, dentro do painel. Preferências de canal
          (e-mail, WhatsApp) ainda não existem — em breve.
        </p>
        <Link href="/dashboard/comunidade" className={`${proGhostButtonClass} mt-3 inline-block`}>
          Ver Comunidade
        </Link>
      </ProCard>
    </main>
  );
}
