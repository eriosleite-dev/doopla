import { redirect } from 'next/navigation';

// Rota legada (15/09/2026) — versão pré-acordeão (Settings V2,
// 09/09/2026) de "Canais da sua Doopla", hoje inline em
// pro-configuracoes-view.tsx. Nada linkava mais até aqui (só um
// comentário obsoleto e um revalidatePath morto em actions.ts). Sem
// conteúdo próprio que ainda faça sentido, essa rota vira redirect.
// ProWhatsappIdentityCard, LinkRoutingCard, ProLinkRoutingForm e
// artist_link_routing preservados (arquivos intocados) — só a
// navegação até aqui foi removida.
export default function CanaisRedirectPage() {
  redirect('/dashboard/perfil');
}
