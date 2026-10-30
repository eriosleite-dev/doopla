import type { Metadata } from 'next';

import { ProCard } from '../../pro-ui';
import { getSessionProfile } from '../../session';
import { ProSettingsDetailHeader } from '../settings-ui';
import { AccountInfoForm } from './account-info-form';
import { ChangeEmailForm } from './change-email-form';

export const metadata: Metadata = {
  title: 'Informações da conta | Doopla',
};

export default async function ContaPage() {
  const { user, profile } = await getSessionProfile();

  return (
    <main>
      <ProSettingsDetailHeader title="Informações da conta" />

      <div className="flex flex-col gap-3.5">
        <ProCard>
          <AccountInfoForm fullName={profile.full_name} phone={profile.phone} />
        </ProCard>

        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">E-mail de login</p>
          <p className="mt-1.5 text-[12.5px] text-[var(--pro-tx-50)]">{user.email}</p>
          <ChangeEmailForm />
        </ProCard>

        {profile.slug && (
          <ProCard>
            <p className="font-pro-sub text-[13.5px] font-bold">Seu código</p>
            <p className="mt-1.5 text-[12.5px] text-[var(--pro-tx-50)]">{profile.slug}</p>
          </ProCard>
        )}
      </div>
    </main>
  );
}
