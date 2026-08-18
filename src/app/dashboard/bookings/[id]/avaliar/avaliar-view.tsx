import { notFound, redirect } from 'next/navigation';

import { formatRelativeDate } from '@/lib/format';

import { getBookingDetail, getBookingReviews } from '../../../data';
import { getSessionProfile } from '../../../session';
import { avatarClass, eyebrowClass, initialsFromName } from '../../../ui';
import { ReviewPanel } from '../review-panel';

export async function AvaliarView({ id }: { id: string }) {
  const { supabase, user, profile } = await getSessionProfile();
  const detail = await getBookingDetail(id, user.id, profile.role, supabase);
  if (!detail) notFound();

  const reviews = await getBookingReviews(id, user.id, supabase);
  if (!reviews.myReview) redirect(`/dashboard/bookings/${id}`);

  const { booking } = detail;

  return (
    <div className="p-7">
      <div className="mb-6 flex items-center gap-3">
        <span className={avatarClass}>{initialsFromName(booking.otherPartyName)}</span>
        <div>
          <p className={eyebrowClass}>
            Avaliando · booking {formatRelativeDate(booking.updated_at)}
          </p>
          <p className="text-[15px] font-semibold">{booking.otherPartyName}</p>
        </div>
      </div>

      <ReviewPanel
        myReview={reviews.myReview}
        reviewOfMe={reviews.reviewOfMe}
        myRole={profile.role === 'booker' ? 'booker' : 'artista'}
        otherPartyName={booking.otherPartyName}
      />
    </div>
  );
}
