import Link from 'next/link';

import type { OutgoingRepresentationRequest } from '../data';
import { avatarClass, initialsFromName } from '../ui';

export function OutgoingRequests({ requests }: { requests: OutgoingRepresentationRequest[] }) {
  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {requests.map((req) => {
        const name = req.artist.stageName || req.artist.fullName;
        const location = [req.artist.city, req.artist.state].filter(Boolean).join(' · ');
        return (
          <div
            key={req.id}
            className="flex items-center gap-3 rounded-[18px] bg-white p-5"
          >
            <Link href={`/dashboard/artistas/${req.artist.profileId}`} className="flex flex-1 items-center gap-3">
              <span className={avatarClass}>{initialsFromName(name)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="truncate text-[12px] text-[var(--ink)]/55">
                  {[req.artist.category, location].filter(Boolean).join(' · ') || 'Artista na doopla'}
                </p>
              </div>
            </Link>
            <span className="font-doopla-mono flex-none rounded-full bg-[var(--paper-dim)] px-3 py-1.5 text-[10px] uppercase tracking-[.03em] text-[var(--ink)]/55">
              Aguardando resposta
            </span>
          </div>
        );
      })}
    </div>
  );
}
