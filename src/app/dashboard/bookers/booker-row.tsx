import type { BookerCard } from '../data';
import { avatarClass, initialsFromName } from '../ui';

export function BookerRow({ booker }: { booker: BookerCard }) {
  const location = [booker.city, booker.state].filter(Boolean).join(' · ');
  const tags = (booker.mercados ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5">
      <div className="flex items-center gap-3">
        <span className={avatarClass}>{initialsFromName(booker.fullName)}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{booker.fullName}</p>
          <p className="truncate text-[12px] text-[var(--ink)]/55">
            {location || booker.perfil || 'Booker na doopla'}
          </p>
        </div>
      </div>
      {booker.ratingCount > 0 ? (
        <p className="font-doopla-mono text-[11.5px] text-[var(--accent-ink)]">
          ★ {booker.ratingAverage?.toFixed(1)} · {booker.ratingCount}{' '}
          {booker.ratingCount === 1 ? 'avaliação' : 'avaliações'}
        </p>
      ) : (
        <p className="text-[11.5px] italic text-[var(--ink)]/45">
          Novo na doopla. Ainda construindo o histórico na plataforma.
        </p>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="font-doopla-mono rounded-full bg-[var(--musgo)]/10 px-2 py-1 text-[10px] uppercase tracking-[.03em] text-[var(--musgo)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {booker.foco && (
        <span className="font-doopla-mono w-fit rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-[10px] uppercase tracking-[.03em] text-[var(--accent-ink)]">
          {booker.foco === 'Universal' ? 'Atende qualquer nicho' : booker.foco}
        </span>
      )}
    </div>
  );
}
