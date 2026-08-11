import type { Metadata } from 'next';

import { getSessionProfile } from '../session';
import { cardClass, eyebrowClass, fieldLabelClass } from '../ui';

export const metadata: Metadata = {
  title: 'Perfil | Doopla',
};

const ROLE_LABELS: Record<string, string> = {
  artista: 'Artista',
  booker: 'Booker',
  agencia: 'Agência',
};

export default async function PerfilPage() {
  const { user, profile } = await getSessionProfile();

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Sua conta</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">Perfil</h1>
      </header>

      <section className={`${cardClass} flex flex-col gap-5`}>
        <div>
          <p className={fieldLabelClass}>Nome</p>
          <p className="mt-1 text-sm text-[var(--ink)]/70">
            {profile.full_name || 'Não informado'}
          </p>
        </div>
        <div>
          <p className={fieldLabelClass}>E-mail</p>
          <p className="mt-1 text-sm text-[var(--ink)]/70">{user.email}</p>
        </div>
        <div>
          <p className={fieldLabelClass}>Tipo de conta</p>
          <p className="mt-1 text-sm text-[var(--ink)]/70">
            {ROLE_LABELS[profile.role] ?? profile.role}
          </p>
        </div>
        {(profile.city || profile.state) && (
          <div>
            <p className={fieldLabelClass}>Cidade</p>
            <p className="mt-1 text-sm text-[var(--ink)]/70">
              {[profile.city, profile.state].filter(Boolean).join(' · ')}
            </p>
          </div>
        )}
      </section>

      <p className="text-[12.5px] text-[var(--ink)]/50">
        Edição de perfil chega em breve.
      </p>
    </main>
  );
}
