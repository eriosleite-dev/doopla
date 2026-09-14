import type { Metadata } from 'next';

import { siteOrigin } from '@/lib/site-url';
import type { LinkRoutingMode } from '@/lib/supabase/types';

import { getArtistBookers, getArtistLinkRouting } from '../../data';
import { getCachedProfessionalHomeFacts } from '../../pro-home-cache';
import { getSessionProfile } from '../../session';
import { LinkRoutingCard } from '../link-routing-card';
import { ProSettingsDetailHeader } from '../settings-ui';
import { ProWhatsappIdentityCard } from '../pro-whatsapp-identity-card';

export const metadata: Metadata = {
  title: 'Canais e conexões | Doopla',
};

// Settings V2 consolidado (09/09/2026) — gerenciamento técnico de
// conexões configuráveis (identidade do profissional + roteamento de
// pedidos), nunca duplicando "Canais de booking" da Home (que é sobre
// como CLIENTES chegam até o profissional — vitrine/leitura, nunca
// edição). "Seu link de orçamento"/"Quem recebe seus pedidos" foi
// movido pra cá (antes vivia dentro do antigo /dashboard/perfil/editar,
// junto do editor de perfil, o que contradizia essa mesma regra na
// prática) — mesmo componente/action de sempre
// (updateLinkRoutingAction), sem capability nova de Booker, sem alterar
// vínculos existentes. Artista-only, igual ao resto de Canais.
export default async function CanaisPage() {
  const { supabase, user, profile } = await getSessionProfile();
  const homeFacts = await getCachedProfessionalHomeFacts(supabase);

  const isArtist = profile.role === 'artista';
  const [bookers, routing, origin] = isArtist
    ? await Promise.all([getArtistBookers(user.id, supabase), getArtistLinkRouting(user.id, supabase), siteOrigin()])
    : [[], null, ''];

  return (
    <main>
      <ProSettingsDetailHeader title="Canais e conexões" />
      <div className="flex flex-col gap-3.5">
        <ProWhatsappIdentityCard
          status={homeFacts?.whatsappIdentityStatus ?? null}
          verifiedNumber={homeFacts?.whatsappVerifiedNumber ?? null}
        />
        {isArtist && (
          <LinkRoutingCard
            bookers={bookers.map((b) => ({ profileId: b.profileId, fullName: b.fullName }))}
            currentMode={(routing?.mode ?? 'eu') as LinkRoutingMode}
            currentBookerId={routing?.booker_id ?? null}
            orcamentoUrl={profile.slug ? `${origin}/orcamento/${profile.slug}` : null}
          />
        )}
      </div>
    </main>
  );
}
