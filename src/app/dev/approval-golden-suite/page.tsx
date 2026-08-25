import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { ApprovalGoldenSuitePanel } from './ApprovalGoldenSuitePanel';

export const metadata: Metadata = {
  title: 'Teste interno — Golden Suite do Approval Resolver',
  robots: { index: false, follow: false },
};

// Ferramenta de desenvolvimento/teste, não é parte do produto — valida
// o julgamento SEMÂNTICO real do Approval Resolver (Bloco 5) contra
// gpt-5-mini, algo que os testes de engenharia (client simulado) não
// conseguem cobrir. Mesmo padrão de segurança de
// /dev/planner-golden-suite: fora de /dashboard de propósito, mesma
// checagem de sessão de qualquer página autenticada.
//
// Cada caso roda contra um ResolutionContextV1 sintético, em memória —
// nunca cria/lê uma conversa real, nunca chama try_acquire_approval_
// resolution_claim/commit_approval_resolution. Testa só a camada
// semântica (o model), não a orquestração física (claim/lease/token
// bucket/versionamento), já validada diretamente em Postgres real —
// ver PROGRESS.md pro relatório completo dessa validação.
export default async function ApprovalGoldenSuitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/approval-golden-suite');

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
        real do Approval Resolver (src/lib/intelligence/approval/) contra casos representativos. Cada caso é um
        ResolutionContextV1 sintético em memória — nenhuma aprovação real é gravada, nenhum claim/lease é
        adquirido, nenhuma conversa real é tocada.
      </div>

      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Golden suite — Approval Resolver</h1>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 24 }}>
        Logado como: {user.email} ({user.id})
      </p>

      <ApprovalGoldenSuitePanel />
    </main>
  );
}
