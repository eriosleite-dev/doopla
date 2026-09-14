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
  local: string | null;
  other_preferences: string | null;
  travels: boolean;
  serves_other_locations: boolean;
  accepts_out_of_city_work: boolean;
  career_stage: string | null;
  fee_range: string | null;
  work_types: string[];
  client_types: string[];
  regions: string[];
  languages: string[];
  help_areas: string[];
  issues_invoice: boolean | null;
};

// Settings V2 consolidado (09/09/2026) — "Como você trabalha", uma das
// 3 rotas que substituem o antigo /dashboard/perfil/editar. Antes era
// o modal "Preferências de matching" — decisão explícita da fundadora:
// matching não é mais conceito do produto (nem copy de "encontrar
// oportunidades"/"buscas e recomendações"), mas os dados continuam
// sendo os mesmos que o Runtime usa como conhecimento declarado pra
// representar o profissional (ver
// src/lib/intelligence/tools/get-professional-business-context.ts).
export default async function ComoVoceTrabalhaPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard/perfil');

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select(
      'local, other_preferences, travels, serves_other_locations, accepts_out_of_city_work, career_stage, fee_range, work_types, client_types, regions, languages, help_areas, issues_invoice'
    )
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
          local={artist?.local ?? null}
          otherPreferences={artist?.other_preferences ?? null}
          travels={artist?.travels ?? false}
          servesOtherLocations={artist?.serves_other_locations ?? false}
          acceptsOutOfCityWork={artist?.accepts_out_of_city_work ?? false}
          careerStage={artist?.career_stage ?? null}
          feeRange={artist?.fee_range ?? null}
          workTypes={artist?.work_types ?? []}
          clientTypes={artist?.client_types ?? []}
          regions={artist?.regions ?? []}
          languages={artist?.languages ?? []}
          helpAreas={artist?.help_areas ?? []}
          issuesInvoice={artist?.issues_invoice ?? null}
        />
      </ProCard>
    </main>
  );
}
