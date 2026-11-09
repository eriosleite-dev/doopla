import { Redirect } from 'expo-router';

// SUPERSEDED como área própria (auditoria de legado, 15/09/2026,
// mesma decisão do Web, ver src/app/dashboard/decisoes/page.tsx) — a
// tela nunca tinha capacidade própria de resolução, todo CTA navegava
// pra dentro de uma conversa. "Precisa de você" continua intacto em
// Home/Bookings/Pedido Detail, mesma fonte real
// (runtime_pending_replies/outbound_intents). Rota preservada como
// redirect seguro (<Redirect>, convenção do Expo Router) — nunca
// apagada, pra qualquer link/deep link antigo continuar funcionando
// sem quebrar. fetchActionableDecisionsPage/fetchResolvedDecisionsPage
// (@/lib/data/decisions) preservadas intactas, sem chamador aqui.
export default function DecisoesRedirectScreen() {
  return <Redirect href="/(tabs)/mais" />;
}
