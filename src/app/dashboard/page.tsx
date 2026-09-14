import type { Metadata } from 'next';

import { BookerHomeView } from './booker-home-view';
import { ProfessionalHomeView } from './professional-home-view';
import { getSessionProfile } from './session';

export const metadata: Metadata = {
  title: 'Painel | Doopla',
};

export default async function DashboardPage(props: {
  searchParams: Promise<{ limiteBooker?: string }>;
}) {
  const { limiteBooker } = await props.searchParams;
  const { supabase, user, profile } = await getSessionProfile();

  // Shell + Home bloco — Home nova é da superfície "profissional"
  // (nunca Booker). Mesmo critério `!== 'booker'` que layout.tsx usa
  // pro Shell, e que o código legado (booker-home-view.tsx) já usava
  // pra tratar role='agencia' (legado, sem cadastro novo) como
  // "não-booker" — preserva o mesmo agrupamento de sempre, só troca o
  // chrome/Home.
  if (profile.role !== 'booker') {
    return <ProfessionalHomeView userId={user.id} profile={profile} supabase={supabase} />;
  }

  return <BookerHomeView limiteBooker={limiteBooker} supabase={supabase} user={user} profile={profile} />;
}
