import type { Metadata } from 'next';

import { ProCard } from '../../pro-ui';
import { ProSettingsDetailHeader } from '../settings-ui';
import { ChangePasswordForm } from './change-password-form';
import { SignOutOtherSessionsButton } from './sign-out-other-sessions-button';

export const metadata: Metadata = {
  title: 'Segurança e acesso | Doopla',
};

// Settings V2 (08/09/2026) — só capacidades reais de autenticação
// (auditadas antes de codar): trocar senha e sair de outros
// dispositivos usam a API do GoTrue diretamente (ver
// account-security-actions.ts), sem migration nenhuma. 2FA/lista real
// de sessões/dispositivos não existem hoje — nunca um toggle falso pra
// preencher a tela; o gap fica só registrado no relatório final.
export default function SegurancaPage() {
  return (
    <main>
      <ProSettingsDetailHeader title="Segurança e acesso" />

      <div className="flex flex-col gap-3.5">
        <ProCard>
          <ChangePasswordForm />
        </ProCard>

        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Sessões</p>
          <p className="mt-1.5 text-[12.5px] text-[var(--pro-tx-50)]">
            Se você entrou na sua conta em outro aparelho e não reconhece, pode encerrar todas as outras sessões agora.
            Esta continua ativa.
          </p>
          <SignOutOtherSessionsButton />
        </ProCard>
      </div>
    </main>
  );
}
