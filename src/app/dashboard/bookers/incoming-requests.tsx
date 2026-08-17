import Link from 'next/link';

import { respondRepresentationRequestAction } from '../actions';
import type { IncomingRepresentationRequest } from '../data';
import { accentButtonClass, avatarClass, ghostButtonClass, initialsFromName } from '../ui';

export function IncomingRequests({ requests }: { requests: IncomingRepresentationRequest[] }) {
  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {requests.map((req) => {
        const { booker } = req;
        const location = [booker.city, booker.state].filter(Boolean).join(' · ');
        const specialties = [...booker.specialtyAreas, ...booker.artistCategories].slice(0, 5);

        return (
          <div key={req.id} className="flex flex-col gap-4 rounded-[18px] bg-white p-5">
            <div className="flex flex-wrap items-start gap-4">
              <Link href={`/dashboard/bookers/${booker.profileId}`} className="flex-none">
                {booker.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={booker.avatarUrl}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <span className={`${avatarClass} h-14 w-14 text-base`}>
                    {initialsFromName(booker.fullName)}
                  </span>
                )}
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboard/bookers/${booker.profileId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {booker.fullName}
                  </Link>
                  {booker.isOfficial && (
                    <span className="font-doopla-mono rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] uppercase tracking-[.03em] text-[var(--accent-ink)]">
                      ★ Booker Doopla Oficial
                    </span>
                  )}
                </div>
                {location && <p className="mt-0.5 text-[12.5px] text-[var(--ink)]/55">{location}</p>}
                <p className="font-doopla-mono mt-1 text-[11.5px] text-[var(--accent-ink)]">
                  {booker.ratingCount > 0
                    ? `★ ${booker.ratingAverage?.toFixed(1)} · ${booker.ratingCount} ${booker.ratingCount === 1 ? 'avaliação' : 'avaliações'}`
                    : 'Novo na doopla. Ainda construindo o histórico na plataforma.'}
                </p>
                {booker.bio && <p className="mt-2 text-[13px] text-[var(--ink)]/75">{booker.bio}</p>}
                {specialties.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {specialties.map((tag) => (
                      <span
                        key={tag}
                        className="font-doopla-mono rounded-full bg-[var(--musgo)]/10 px-2 py-1 text-[10px] uppercase tracking-[.03em] text-[var(--musgo)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <Link
                  href={`/dashboard/bookers/${booker.profileId}`}
                  className="mt-2 inline-block text-[12.5px] text-[var(--accent-ink)] underline underline-offset-2"
                >
                  Ver perfil completo
                </Link>
              </div>
            </div>

            {req.message && (
              <p className="rounded-[12px] bg-[var(--paper-dim)] p-3 text-[13px] text-[var(--ink)]/70">
                &ldquo;{req.message}&rdquo;
              </p>
            )}

            <div className="flex gap-2">
              <form action={respondRepresentationRequestAction}>
                <input type="hidden" name="requestId" value={req.id} />
                <input type="hidden" name="decision" value="aceitar" />
                <button type="submit" className={accentButtonClass}>
                  Aceitar
                </button>
              </form>
              <form action={respondRepresentationRequestAction}>
                <input type="hidden" name="requestId" value={req.id} />
                <input type="hidden" name="decision" value="recusar" />
                <button type="submit" className={ghostButtonClass}>
                  Recusar
                </button>
              </form>
            </div>
          </div>
        );
      })}
    </div>
  );
}
