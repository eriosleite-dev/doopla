import { redirect } from 'next/navigation';

// Rota legada (15/09/2026) — "Preferências da Doopla" existia só pra
// mostrar 2 coisas: a escolha WhatsApp/Painel/Ambos (attention_channel,
// saiu de Configurações por completo — auditoria confirmou zero efeito
// operacional real, nunca lido por nenhum código de notificação/envio)
// e um card-preview de "Perfil e trabalho" (já redundante, a própria
// Configurações já linka direto pra lá). Sem conteúdo próprio que
// ainda faça sentido, essa rota vira redirect — nunca uma página órfã
// alcançável. Preservado: coluna attention_channel, action
// updateAttentionChannelAction, componente AttentionChannelForm (ver
// pro-configuracoes-view.tsx) — nada de infraestrutura foi apagado,
// só a navegação até aqui.
export default function PreferenciasRedirectPage() {
  redirect('/dashboard/perfil');
}
