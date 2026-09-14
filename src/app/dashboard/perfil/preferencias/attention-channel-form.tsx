'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { updateAttentionChannelAction } from '../../actions';
import { proGhostButtonClass, proPrimaryButtonClass } from '../../pro-format';

type Channel = 'whatsapp' | 'painel' | 'ambos';

const OPTIONS: { value: Channel; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'painel', label: 'Painel' },
  { value: 'ambos', label: 'WhatsApp + Painel' },
];

export function AttentionChannelForm({ initialChannel }: { initialChannel: Channel | null }) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel | null>(initialChannel);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function select(next: Channel) {
    setChannel(next);
    setError(null);
    startTransition(async () => {
      const result = await updateAttentionChannelAction(next);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={pending}
            onClick={() => select(option.value)}
            className={channel === option.value ? proPrimaryButtonClass : proGhostButtonClass}
          >
            {option.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-[12.5px] text-[var(--pro-red)]">{error}</p>}
    </div>
  );
}
