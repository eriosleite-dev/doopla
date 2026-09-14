import type { Metadata } from 'next';

import { SUPPORT_EMAIL } from '@/lib/support';
import { proPrimaryButtonClass } from '../../pro-format';
import { ProCard } from '../../pro-ui';
import { ProSettingsDetailHeader } from '../settings-ui';

export const metadata: Metadata = {
  title: 'Ajuda e suporte | Doopla',
};

// Settings V2 (08/09/2026) — "Falar com minha Doopla" (IA/representante
// operando o trabalho do profissional) e "Falar com o suporte da
// Doopla" (problema de produto/conta/assinatura) são coisas
// diferentes, nunca confundidas aqui: o primeiro já vive na Home
// (professional-home-view.tsx); esta página é só o segundo. Sem
// Central de Ajuda — não existe hoje, não inventada.
export default function SuportePage() {
  return (
    <main>
      <ProSettingsDetailHeader title="Ajuda e suporte" />

      <ProCard>
        <p className="font-pro-sub text-[13.5px] font-bold">Fale com o suporte da Doopla</p>
        <p className="mt-1.5 text-[12.5px] text-[var(--pro-tx-50)]">
          Problema com sua conta, assinatura ou o painel? Isso é diferente de &ldquo;Falar com minha Doopla&rdquo; (sua
          representante, na Home) — aqui é sobre o produto em si.
        </p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className={`${proPrimaryButtonClass} mt-3 inline-block`}>
          Enviar e-mail para o suporte
        </a>
      </ProCard>
    </main>
  );
}
