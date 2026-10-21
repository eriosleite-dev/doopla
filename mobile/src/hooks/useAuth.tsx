import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import type { Profile } from '../types/profile';

// Doopla Mobile — estado de autenticação único do app (login/logout/
// restauração de sessão/usuário atual/professional_id), mesmo
// raciocínio de getSessionProfile() no painel web
// (src/app/dashboard/session.ts): profiles.id É o id da profissional,
// nunca uma segunda lógica de identidade — aqui só reproduzimos essa
// mesma leitura (auth -> profiles por id) do lado do cliente, já que
// não existe Server Component/cookie no app nativo pra fazer isso no
// servidor como o web faz.

type AuthState = {
  session: Session | null;
  user: User | null;
  // = user.id = profiles.id. Nome explícito aqui só pra deixar claro
  // no call site — não é uma coluna nem um conceito à parte.
  professionalId: string | null;
  profile: Profile | null;
  // true enquanto a sessão inicial ainda está sendo restaurada (ou o
  // profile ainda não voltou) — usado pra nunca mostrar/decidir nada
  // de auth antes de saber o estado real.
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Restauração de sessão ao abrir o app: getSession() lê do
  // SecureStore (via o adapter configurado em lib/supabase.ts);
  // onAuthStateChange mantém tudo sincronizado depois (login, logout,
  // refresh de token) sem precisar de mais nenhum código chamando
  // isso manualmente.
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionLoaded(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Busca o profile (mesma tabela, mesmo id, mesma RLS que o web já
  // usa) toda vez que o usuário autenticado muda — nunca cacheia
  // profile de uma sessão anterior depois de um login diferente.
  useEffect(() => {
    let active = true;
    setProfileLoaded(false);

    if (!session?.user) {
      setProfile(null);
      setProfileLoaded(true);
      return;
    }

    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          // Nunca lança pra fora — um profile ausente/erro de rede vira
          // profile=null, o call site decide o que fazer (ex.: tela de
          // erro), nunca uma exceção não tratada derrubando o app.
          console.error('useAuth: falha ao buscar profile', error.message);
          setProfile(null);
        } else {
          setProfile(data as Profile);
        }
        setProfileLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    professionalId: session?.user?.id ?? null,
    profile,
    loading: !sessionLoaded || !profileLoaded,
    signInWithPassword,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() precisa ser chamado dentro de <AuthProvider>.');
  }
  return ctx;
}
