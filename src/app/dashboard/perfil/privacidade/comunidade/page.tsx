import { redirect } from 'next/navigation';

// Rota legada (15/09/2026) — "Privacidade na Comunidade" (os 7 toggles
// show_*) saiu da UI de Configurações: auditoria confirmou zero efeito
// visível hoje na Comunidade (CommunityAuthorSnapshot, o tipo que a UI
// realmente usa, nem carrega bio/specialties/workTypes/instagramUrl/
// portfolioUrl; city/avatarUrl chegam ao tipo mas nenhum componente os
// renderiza). 2 dos 7 (especialidades/tipos de trabalho) dependiam de
// `genres`/`work_types`, sem superfície de edição desde a
// simplificação de "Perfil e trabalho". CommunityPrivacyForm
// preservado (arquivo intocado, só sem nenhum caller na UI agora) —
// nada de infraestrutura foi apagado, só a navegação até aqui. Quando
// a Comunidade passar a exibir esses campos de verdade, revisar quais
// controles voltam.
export default function PrivacidadeComunidadeRedirectPage() {
  redirect('/dashboard/perfil');
}
