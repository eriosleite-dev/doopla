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

// Settings V2 (08/09/2026) — "como a Doopla trabalha com o
// profissional", nunca configuração genérica de conta. Conhecimento
// declarado aqui é sempre contexto, nunca autorização — Mandate/
// Approval Gate/Policy Gate continuam sendo a autoridade real sobre o
// que a Doopla pode fazer sozinha, sem nenhuma mudança aqui. O
// enriquecimento mais amplo (regiões, estágio de carreira, tipos de
// trabalho, contexto comercial) mora em "Perfil profissional" —
// superfície separada, já existente, só linkada daqui (nunca duplicada
// dentro de Configurações).
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
          <p className="font-pro-sub text-[13.5px] font-bold">Contexto profissional e comercial</p>
          <p className="mt-1.5 text-[12.5px] text-[var(--pro-tx-50)]">
            Estágio de carreira, tipos de trabalho, regiões de atuação, faixa de cachê e se você emite nota fiscal — o que
            sua Doopla usa como conhecimento declarado, nunca como autorização.
          </p>
          <Link href="/dashboard/perfil/editar#preferencias-matching" className={`${proGhostButtonClass} mt-3 inline-block`}>
            Editar perfil profissional
          </Link>
        </ProCard>
      </div>
    </main>
  );
}
