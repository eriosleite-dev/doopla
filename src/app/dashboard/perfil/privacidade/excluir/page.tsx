import type { Metadata } from 'next';

import { ProCard } from '../../../pro-ui';
import { ProSettingsDetailHeader } from '../../settings-ui';
import { DeleteAccountForm } from './delete-account-form';

export const metadata: Metadata = {
  title: 'Excluir minha conta | Doopla',
};

// Account closure flow (Settings V2, 08/09/2026) — a copy explica o que
// acontece ANTES de pedir confirmação, nunca depois. Detalhes exatos
// (o que é preservado vs. encerrado) documentados aqui porque é a única
// tela do produto que fala sobre isso — nunca duplicar este texto em
// outro lugar.
export default function ExcluirContaPage() {
  return (
    <main>
      <ProSettingsDetailHeader title="Excluir minha conta" />

      <ProCard>
        <p className="text-[13.5px] font-semibold text-[var(--pro-off)]">Excluir sua conta é uma ação permanente.</p>
        <p className="mt-2 text-[12.5px] text-[var(--pro-tx-50)]">
          Antes de continuar, veja o que acontece com sua assinatura, seus dados e seu histórico.
        </p>

        <ul className="mt-4 flex flex-col gap-2.5 text-[12.5px] text-[var(--pro-tx-50)]">
          <li>
            <strong className="text-[var(--pro-off)]">Assinatura:</strong> é cancelada — a Doopla para de representar você
            a partir daqui.
          </li>
          <li>
            <strong className="text-[var(--pro-off)]">Bookings e contratos:</strong> continuam existindo, intactos, pra
            preservar o histórico de quem trabalhou com você. Ninguém consegue criar um booking novo com você depois disso.
          </li>
          <li>
            <strong className="text-[var(--pro-off)]">Booker/representação:</strong> qualquer vínculo ativo é encerrado.
          </li>
          <li>
            <strong className="text-[var(--pro-off)]">Comunidade:</strong> seu perfil passa a aparecer como &ldquo;Usuário
            removido&rdquo;. Tópicos e respostas que você escreveu continuam existindo — não apagamos discussões coletivas.
          </li>
          <li>
            <strong className="text-[var(--pro-off)]">Canais:</strong> seu link público e roteamento de WhatsApp são
            desativados.
          </li>
          <li>
            <strong className="text-[var(--pro-off)]">Depois:</strong> você é desconectado de todos os dispositivos. Um
            cadastro novo com o mesmo e-mail no futuro é uma conta nova — nada é restaurado automaticamente.
          </li>
        </ul>

        <div className="mt-5 border-t border-[var(--pro-line)] pt-5">
          <DeleteAccountForm />
        </div>
      </ProCard>
    </main>
  );
}
