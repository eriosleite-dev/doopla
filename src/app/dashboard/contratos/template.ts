import type { Booking, ContractContent, Profile } from '@/lib/supabase/types';

export const CONTRACT_TEMPLATE_VERSION = 'escopo-partes-evento-v1';

// Módulos liberados (doopla-gerador-contrato.md): escopo, partes, evento.
// Pagamento e cancelamento dependem do rascunho de cancelamento/reembolso
// (aguardando Pagar.me/jurídico) — nunca gerados aqui, só listados como
// pendentes, pra o documento nunca fingir cobrir o que não cobre.
export function buildContractContent(
  booking: Booking,
  artist: Pick<Profile, 'full_name'>,
  booker: Pick<Profile, 'full_name'>
): ContractContent {
  const eventDate = booking.event_date
    ? new Date(`${booking.event_date}T00:00:00`).toLocaleDateString('pt-BR')
    : 'A definir';
  const location = booking.event_location?.trim() || 'A definir';
  const clientDoc = booking.client_document?.trim();

  return {
    escopo: `O presente instrumento tem por objeto a prestação de serviços artísticos por ${artist.full_name}, com intermediação de ${booker.full_name}, referente ao seguinte trabalho: ${booking.description || 'conforme combinado entre as partes'}.`,
    partes: `CONTRATADO (Artista): ${artist.full_name}. INTERMEDIÁRIO (Booker): ${booker.full_name}, comissão de ${booking.commission_percent}% sobre o cachê. CONTRATANTE: ${booking.client_name}${clientDoc ? `, ${clientDoc}` : ''}.`,
    evento: `Data: ${eventDate}. Local: ${location}.`,
    pendente: [
      'Forma de pagamento — depende da validação da política de pagamento com o PSP.',
      'Política de cancelamento — depende da validação jurídica em andamento.',
    ],
  };
}
