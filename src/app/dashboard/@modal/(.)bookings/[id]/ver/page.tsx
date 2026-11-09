import { notFound } from 'next/navigation';

import { getSessionProfile } from '../../../../session';
import { BookingDrawerShell } from '../../../../bookings/[id]/booking-drawer-shell';
import { loadBookingDetailViewProps } from '../../../../bookings/[id]/booking-detail-loader';
import { LegacyBookingDetailView } from '../../../../bookings/[id]/legacy-booking-detail-view';
import { ProBookingDetailView } from '../../../../bookings/[id]/pro-booking-detail-view';
import { ProfileModal } from '../../../../profile-modal';

// BookingDrawer (aprovado pela fundadora, 30/09/2026) — mesma busca de
// dados e o mesmo branch por role da página completa
// (bookings/[id]/page.tsx), via loadBookingDetailViewProps
// (booking-detail-loader.ts) — zero lógica duplicada. Só o container
// muda: Booker (se algum dia chegar aqui — hoje só o painel novo linka
// pra esta rota /ver, TrabalhosList do Booker continua linkando pra
// rota canônica, nunca interceptada) usa o mesmo ProfileModal já usado
// em @modal/(.)bookings/[id]/avaliar e /conversa; artista/agência usa
// o novo BookingDrawerShell (dark, lateral).
export default async function BookingDrawerModalPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, user, profile } = await getSessionProfile();

  const viewProps = await loadBookingDetailViewProps(id, user.id, profile.role, supabase);
  if (!viewProps) notFound();

  if (profile.role === 'booker') {
    return (
      <ProfileModal>
        <LegacyBookingDetailView {...viewProps} />
      </ProfileModal>
    );
  }

  return (
    <BookingDrawerShell>
      <ProBookingDetailView {...viewProps} compact />
    </BookingDrawerShell>
  );
}
