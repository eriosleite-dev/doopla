'use client';

import { useActionState } from 'react';

import { updateCommunityPrivacyAction, type CommunityPrivacyFormState } from '../../../community-privacy-actions';
import { proPrimaryButtonClass } from '../../../pro-format';

type ToggleKey = 'showCity' | 'showAvatar' | 'showBio' | 'showSpecialties' | 'showWorkTypes' | 'showInstagram' | 'showPortfolio';

// Rótulos em linguagem comum — nunca o nome técnico da coluna (regra
// explícita desta rodada). Mesma ordem das colunas em community_profiles.
const TOGGLES: { key: ToggleKey; label: string }[] = [
  { key: 'showCity', label: 'Mostrar minha cidade' },
  { key: 'showAvatar', label: 'Mostrar minha foto' },
  { key: 'showBio', label: 'Mostrar minha bio' },
  { key: 'showSpecialties', label: 'Mostrar minhas especialidades' },
  { key: 'showWorkTypes', label: 'Mostrar tipos de trabalho' },
  { key: 'showInstagram', label: 'Mostrar meu Instagram' },
  { key: 'showPortfolio', label: 'Mostrar meu portfólio' },
];

const initialState: CommunityPrivacyFormState = {};

// availableForReferrals nunca vira um toggle aqui (não é um dos 7
// campos pedidos) — só atravessa como hidden field pra RPC não
// resetar esse valor, que é escrito pela mesma update_community_profile
// mas não tem UI nesta tela (ver community-privacy-actions.ts).
export function CommunityPrivacyForm({
  availableForReferrals,
  showCity,
  showAvatar,
  showBio,
  showSpecialties,
  showWorkTypes,
  showInstagram,
  showPortfolio,
}: {
  availableForReferrals: boolean;
  showCity: boolean;
  showAvatar: boolean;
  showBio: boolean;
  showSpecialties: boolean;
  showWorkTypes: boolean;
  showInstagram: boolean;
  showPortfolio: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateCommunityPrivacyAction, initialState);
  const currentValues: Record<ToggleKey, boolean> = {
    showCity,
    showAvatar,
    showBio,
    showSpecialties,
    showWorkTypes,
    showInstagram,
    showPortfolio,
  };

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="availableForReferrals" value={String(availableForReferrals)} />

      <div className="flex flex-col divide-y divide-[var(--pro-line)]">
        {TOGGLES.map((toggle) => (
          <label key={toggle.key} className="flex cursor-pointer items-center justify-between gap-4 py-3.5">
            <span className="text-[13.5px] text-[var(--pro-off)]">{toggle.label}</span>
            <input
              type="checkbox"
              name={toggle.key}
              defaultChecked={currentValues[toggle.key]}
              className="h-5 w-5 flex-none accent-[var(--pro-red)]"
            />
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pending} className={proPrimaryButtonClass}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        {state.success && <p className="text-[12.5px] text-[var(--pro-green)]">Salvo.</p>}
        {state.error && <p className="text-[12.5px] text-[var(--pro-red)]">{state.error}</p>}
      </div>
    </form>
  );
}
