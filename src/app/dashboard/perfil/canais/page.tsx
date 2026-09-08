import type { Metadata } from 'next';

import { getCachedProfessionalHomeFacts } from '../../pro-home-cache';
import { getSessionProfile } from '../../session';
import { ProSettingsDetailHeader } from '../settings-ui';
import { ProWhatsappIdentityCard } from '../pro-whatsapp-identity-card';

export const metadata: Metadata = {
  title: 'Canais e conexões | Doopla',
};

// Settings V2 (08/09/2026) — gerenciamento técnico de conexões
// configuráveis (identidade do profissional), nunca duplicando "Canais
// de booking" da Home (que é sobre como CLIENTES chegam até o
// profissional — link de orçamento, WhatsApp da Doopla, código). Hoje
// só existe uma conexão configurável de verdade: WhatsApp verificado
// (migration 0064). E-mail de representação Pro e outras integrações
// não existem — nenhuma seção vazia forçada aqui.
export default async function CanaisPage() {
  const { supabase } = await getSessionProfile();
  const homeFacts = await getCachedProfessionalHomeFacts(supabase);

  return (
    <main>
      <ProSettingsDetailHeader title="Canais e conexões" />
      <ProWhatsappIdentityCard
        status={homeFacts?.whatsappIdentityStatus ?? null}
        verifiedNumber={homeFacts?.whatsappVerifiedNumber ?? null}
      />
    </main>
  );
}
