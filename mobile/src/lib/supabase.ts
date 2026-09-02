import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

import { supabaseAnonKey, supabaseUrl } from './env';

// Doopla Mobile — cliente Supabase único do app, mesmo projeto/mesmos
// usuários/mesmas RLS do painel web. Nunca lê SUPABASE_SERVICE_ROLE_KEY
// (essa variável nem existe no bundle do Expo — só as EXPO_PUBLIC_*
// declaradas em src/lib/env.ts) — toda operação daqui em diante
// respeita RLS como qualquer sessão autenticada normal, exatamente
// como o client de browser do painel (src/lib/supabase/client.ts no
// projeto Next.js).
//
// Diferença real em relação ao web: lá a sessão vive em cookie
// httpOnly gerenciado pelo `@supabase/ssr`; aqui não existe cookie de
// navegador, então o SDK puro (`@supabase/supabase-js`) precisa de um
// adapter de storage explícito. Optamos por expo-secure-store (Keychain
// no iOS, Keystore no Android) em vez de AsyncStorage simples — Async­
// Storage é só persistente, não é criptografado no dispositivo; como
// o requisito foi "armazenamento seguro/persistente", SecureStore é a
// escolha que atende as duas palavras, não só uma.
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // Nunca existe callback de OAuth por URL neste client (isso é
    // coisa de navegador) — detectSessionInUrl teria que estar ligado
    // do outro jeito (deep link) se algum dia entrar login social;
    // por ora, só email/senha, então false é o valor correto, nunca
    // um default esquecido.
    detectSessionInUrl: false,
  },
});

// Recomendação oficial do Supabase para React Native: o refresh
// automático de token só deve rodar com o app em primeiro plano —
// sem isso, o timer de refresh pode disparar (ou deixar de disparar
// corretamente) com o app em background por muito tempo. Chamado uma
// única vez, no import deste módulo (client singleton, nunca recriado).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
