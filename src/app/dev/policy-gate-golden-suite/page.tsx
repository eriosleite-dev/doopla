import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { PolicyGateGoldenSuitePanel } from './PolicyGateGoldenSuitePanel';

export const metadata: Metadata = {
  title: 'Teste interno — Golden Suite do Post-model Policy Gate',
  robots: { index: false, follow: false },
};

// Ferramenta de desenvolvimento/teste, não é parte do produto — valida
// o julgamento SEMÂNTICO real do extrator de compromisso do Post-model
// Policy Gate contra gpt-5-mini, algo que os testes de engenharia
// (model call simulado) não conseguem cobrir. Mesmo padrão de segurança
// de /dev/approval-golden-suite: fora de /dashboard de propósito,
// mesma checagem de sessão de qualquer página autenticada.
//
// Cada caso roda contra um proposedResponse sintético, em memória —
// nunca cria/lê uma conversa real, nunca chama get_active_approvals/
// record_policy_gate_decision. Testa só a camada semântica (o
// extrator), não o matching (100% código, já validado nos testes
// determinísticos — ver PROGRESS.md).
export default async function PolicyGateGoldenSuitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/policy-gate-golden-suite');

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px', fontFamily: 'monospace' }}>
      <div
        style={{
          background: '#fff3cd',
          border: '1px solid #d4a72c',
          borderRadius: 6,
          padding: '10px 14px',
          marginBottom: 24,
          fontSize: 13,
        }}
      >
        🧪 <strong>Ferramenta interna de teste</strong> — não é parte do produto. Valida o julgamento semântico
        real do extrator do Post-model Policy Gate (src/lib/intelligence/policy-gate-post/) contra casos
        representativos. Nenhuma decisão real é gravada, nenhuma tabela é tocada além de auth.
      </div>

      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Golden suite — Post-model Policy Gate</h1>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 24 }}>
        Logado como: {user.email} ({user.id})
      </p>

      <PolicyGateGoldenSuitePanel />
    </main>
  );
}
