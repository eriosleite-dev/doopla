import type { Metadata } from 'next';

import { getSubscription } from '../../data';
import { getSessionProfile } from '../../session';
import { ProAssinaturaView } from './pro-assinatura-view';

export const metadata: Metadata = {
  title: 'Plano e assinatura | Doopla',
};

export default async function AssinaturaPage() {
  const { supabase, user } = await getSessionProfile();
  const subscription = await getSubscription(user.id, supabase);

  return <ProAssinaturaView subscription={subscription} />;
}
