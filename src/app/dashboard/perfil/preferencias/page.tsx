import type { Metadata } from 'next';
import Link from 'next/link';

import { proGhostButtonClass } from '../../pro-format';
import { ProCard } from '../../pro-ui';
import { getSessionProfile } from '../../session';
import { ProSettingsDetailHeader } from '../settings-ui';
import { AttentionChannelForm } from './attention-channel-form';

export const metadata: Metadata = {
  title: 'Preferências da Doopla | Doopla',
};

type ArtistAttention = { attention_channel: 'whatsapp' | 'painel' | 'ambos' | null };

// Settings V2 (08/09/2026), consolidado (09/09/2026) — "como a Doopla
// trabalha com o profissional", nunca configuração genérica de conta.
// Conhecimento declarado aqui é sempre contexto, nunca autorização —
// Mandate/Approval Gate/Policy Gate continuam sendo a autoridade real
// sobre o que a Doopla pode fazer sozinha, sem nenhuma mudança aqui. O
// enriquecimento mais amplo (o que faz, onde atende, cachê de
// referência, nota fiscal) mora em "Perfil e trabalho"
// (/dashboard/perfil/dados, unificado no redesign de 15/09/2026), só
// linkado daqui (nunca duplicado dentro de Configurações).
export default async function PreferenciasPage() {
  const { supabase, user, profile } = await getSessionProfile();

  let attentionChannel: 'whatsapp' | 'painel' | 'ambos' | null = null;
  if (profile.role === 'artista') {
    const { data } = await supabase
      .from('artist_profiles')
      .select('attention_channel')
      .eq('profile_id', user.id)
      .maybeSingle<ArtistAttention>();
    attentionChannel = data?.attention_channel ?? null;
  }

  return (
    <main>
      <ProSettingsDetailHeader title="Preferências da Doopla" subtitle="Como sua Doopla trabalha com você." />

      <div className="flex flex-col gap-3.5">
        {profile.role === 'artista' && (
          <ProCard>
            <p className="font-pro-sub text-[13.5px] font-bold">Como sua Doopla fala com você</p>
            <p className="mt-1.5 text-[12.5px] text-[var(--pro-tx-50)]">
              Quando sua Doopla precisar de você, como prefere ser avisado?
            </p>
            <AttentionChannelForm initialChannel={attentionChannel} />
          </ProCard>
        )}

        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Perfil e trabalho</p>
          <p className="mt-1.5 text-[12.5px] text-[var(--pro-tx-50)]">
            O que você faz, onde atende, seu cachê de referência e se você emite nota fiscal: o que sua Doopla usa como
            conhecimento declarado, nunca como autorização.
          </p>
          <Link href="/dashboard/perfil/dados" className={`${proGhostButtonClass} mt-3 inline-block`}>
            Editar
          </Link>
        </ProCard>
      </div>
    </main>
  );
}
