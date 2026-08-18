import Link from 'next/link';

import { respondRepresentationRequestAction } from '../actions';
import type { OutgoingRepresentationRequest } from '../data';
import { accentButtonClass, avatarClass, ghostButtonClass, initialsFromName } from '../ui';

export function IncomingArtistRequests({ requests }: { requests: OutgoingRepresentationRequest[] }) {
  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {requests.map((req) => {
        const name = req.artist.stageName || req.artist.fullName;
        const location = [req.artist.city, req.artist.state].filter(Boolean).join(' · ');

        return (
          <div key={req.id} className="flex flex-col gap-4 rounded-[18px] bg-white p-5">
            <Link href={`/dashboard/artistas/${req.artist.profileId}`} className="flex items-center gap-3">
              <span className={avatarClass}>{initialsFromName(name)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="truncate text-[12px] text-[var(--ink)]/55">
                  {[req.artist.category, location].filter(Boolean).join(' · ') || 'Artista na doopla'}
                </p>
              </div>
            </Link>

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
