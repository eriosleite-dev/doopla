import type { Metadata } from 'next';

import { getActivePaymentDetails } from '../../data';
import { PaymentDetailsFields } from '../../dinheiro/pro-payment-details-card';
import { ProCard } from '../../pro-ui';
import { getSessionProfile } from '../../session';
import { ProSettingsDetailHeader } from '../settings-ui';

export const metadata: Metadata = {
  title: 'Dados de recebimento | Doopla',
};

// Settings V2 (08/09/2026) — item já entregue (§73/§78), só reposicionado
// dentro da nova arquitetura de detalhe. Mesmo formulário/Server Action/
// RPC de sempre (PaymentDetailsFields → setPaymentDetailsAction →
// set_payment_details, migration 0046) — nunca uma segunda
// implementação. is_operationally_ready() continua lendo esta mesma
// tabela, sem nenhuma mudança de contrato.
export default async function RecebimentoPage() {
  const { supabase, user } = await getSessionProfile();
  const paymentDetails = await getActivePaymentDetails(user.id, supabase);

  return (
    <main>
      <ProSettingsDetailHeader
        title="Dados de recebimento"
        subtitle="A Doopla usa isso pra orientar o cliente sobre o pagamento — que é feito direto pra você."
      />
      <ProCard>
        <PaymentDetailsFields key={paymentDetails?.pixKey ?? 'unset'} active={paymentDetails} />
      </ProCard>
    </main>
  );
}
