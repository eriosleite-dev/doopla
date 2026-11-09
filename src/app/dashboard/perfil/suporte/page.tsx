import { redirect } from 'next/navigation';

// Rota legada (15/09/2026) — versão pré-acordeão (Settings V2,
// 08/09/2026) de "Ajuda e suporte", hoje inline em
// pro-configuracoes-view.tsx (FAQ + Suporte). Zero referências em todo
// o código a essa rota (confirmado na auditoria). Sem conteúdo próprio
// que ainda faça sentido, vira redirect. SUPPORT_EMAIL/proPrimaryButtonClass
// preservados (arquivo intocado, este era o único importador).
export default function SuporteRedirectPage() {
  redirect('/dashboard/perfil');
}
