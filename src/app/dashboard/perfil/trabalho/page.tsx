import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ProCard } from '../../pro-ui';
import { getSessionProfile } from '../../session';
import { ProWorkContextForm } from '../pro-work-context-form';
import { ProSettingsDetailHeader } from '../settings-ui';

export const metadata: Metadata = {
  title: 'Como você trabalha | Doopla',
};

type ArtistWorkContext = {
  what_you_do: string | null;
  where_you_serve: string | null;
  other_preferences: string | null;
  fee_range: string | null;
  issues_invoice: boolean | null;
};

// Settings V2 consolidado (09/09/2026) — "Como você trabalha", uma das
// 3 rotas que substituem o antigo /dashboard/perfil/editar. Antes era
// o modal "Preferências de matching" — decisão explícita da fundadora:
// matching não é mais conceito do produto, mas os dados continuam
// sendo os que o Runtime usa como conhecimento declarado pra
// representar o profissional (ver
// src/lib/intelligence/tools/get-professional-business-context.ts).
//
// Simplificação de beta (14/09/2026): whatYouDo/whereYouServe (texto
// livre, migration 0080) substituem os 5 grupos de chips antigos —
// ver pro-work-context-form.tsx pro raciocínio completo.
export default async function ComoVoceTrabalhaPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard/perfil');

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('what_you_do, where_you_serve, other_preferences, fee_range, issues_invoice')
    .eq('profile_id', user.id)
    .single<ArtistWorkContext>();

  return (
    <main>
      <ProSettingsDetailHeader
        title="Como você trabalha"
        subtitle="Informações que ajudam sua Doopla a entender como você trabalha e te representar melhor nas conversas."
      />

      <ProCard>
        <ProWorkContextForm
          whatYouDo={artist?.what_you_do ?? null}
          whereYouServe={artist?.where_you_serve ?? null}
          otherPreferences={artist?.other_preferences ?? null}
          feeRange={artist?.fee_range ?? null}
          issuesInvoice={artist?.issues_invoice ?? null}
        />
      </ProCard>
    </main>
  );
}
