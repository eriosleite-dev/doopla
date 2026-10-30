import { redirect } from 'next/navigation';

// Rota legada (15/09/2026) — "Privacidade e dados" ficou pequena o
// suficiente pra caber inline no accordion de Configurações
// (pro-configuracoes-view.tsx): só Políticas + Excluir conta, depois
// da simplificação que tirou "Seus dados" (placeholder "em breve",
// zero infra) e os 7 toggles de "Privacidade na Comunidade" (auditoria
// confirmou zero efeito visível hoje — ver comentário em
// pro-configuracoes-view.tsx). Sem conteúdo próprio que ainda faça
// sentido, essa rota vira redirect — nunca uma página órfã alcançável.
// Preservado: community_profiles, community_profiles_public,
// CommunityPrivacyForm, DeleteAccountForm/DeleteAccountModal — nada de
// infraestrutura foi apagado, só a navegação até aqui.
export default function PrivacidadeRedirectPage() {
  redirect('/dashboard/perfil');
}
