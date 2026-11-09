import { redirect } from 'next/navigation';

// Alias só pro BookingDrawer (@modal/(.)bookings/[id]/ver, 30/09/2026)
// — BookingRowCompact (painel do profissional) linka pra cá em vez da
// URL canônica do booking, de propósito: a rota canônica
// (/dashboard/bookings/[id]) é a mesma que TrabalhosList (Booker,
// tema legado) já usa pra navegação em página cheia hoje — interceptar
// ela mudaria esse comportamento pra todo mundo que navega pra lá,
// Booker incluído, o que está fora do escopo desta sessão (painel
// Profissional, sem alterar o fluxo do Booker). Com este alias
// separado, só quem entra por aqui (sempre vindo do painel novo) é
// interceptado pelo drawer — a rota canônica nunca muda de
// comportamento.
//
// Esta página só existe pra navegação direta/hard reload (ex.: o
// usuário atualiza a página com o drawer aberto) — nesse caso não há
// nada pra interceptar, então renderiza de verdade; como não deve
// existir nenhuma UI própria aqui (evitar duplicar a página de
// detalhe), ela só redireciona pra URL canônica do booking.
export default async function BookingDrawerAliasPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  redirect(`/dashboard/bookings/${id}`);
}
