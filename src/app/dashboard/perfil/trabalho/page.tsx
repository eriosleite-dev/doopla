import { redirect } from 'next/navigation';

// Redesign "Perfil e trabalho" (15/09/2026) — "Como você trabalha" foi
// unificada com "Dados profissionais" numa página só
// (/dashboard/perfil/dados). Esta rota continua existindo (nunca
// quebrar link antigo, ex. o card "Como você trabalha" em Preferências
// da Doopla, revalidatePath de updateArtistWorkContextAction, favoritos
// salvos) — só redireciona pra página unificada.
export default function ComoVoceTrabalhaRedirectPage() {
  redirect('/dashboard/perfil/dados');
}
