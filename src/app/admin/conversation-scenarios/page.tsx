import type { Metadata } from 'next';

import { getAdminSession } from '../session';
import { ConversationScenariosPanel } from './Panel';

export const metadata: Metadata = {
  title: 'Admin — AI Evaluation Harness',
  robots: { index: false, follow: false },
};

// Painel Admin — AI Evaluation Harness (ADR 0005, 16/10/2026).
// Autorização administrativa de verdade (getAdminSession, checa
// profiles.is_admin), não só sessão autenticada — requisito 4 da
// fundadora. Mesmo padrão do resto do /admin: layout.tsx do grupo já
// cuida de navegação; esta page só monta o conteúdo.
export default async function ConversationScenariosPage() {
  await getAdminSession();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">AI Evaluation Harness — Conversation Scenarios</h1>
      <p className="text-sm text-zinc-500">
        Valida compreensão conversacional (Classifier, Planner, reconhecedor de delegação) contra o modelo real, usando cenários baseados em conversas
        reais relatadas nos testes de WhatsApp. Nunca executa ação real (sem envio, sem mudança de booking, sem cobrança).
      </p>
      <ConversationScenariosPanel />
    </div>
  );
}
