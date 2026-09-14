import 'react-native-url-polyfill/auto';
// Precisa vir ANTES de qualquer uso de crypto.getRandomValues (usado
// dentro de LargeSecureStore._encrypt abaixo) — o Hermes não expõe
// isso nativamente, esse import só tem efeito colateral de polyfill,
// nunca é referenciado diretamente.
import 'react-native-get-random-values';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
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
// Storage de sessão — decisão revisada (achado real, confirmado contra
// a documentação atual da própria Supabase, não só suposição): o
// expo-secure-store sozinho NÃO SUPORTA valores maiores que 2048 bytes
// (limite documentado do Keychain/Keystore por trás dele). Uma sessão
// Supabase completa (access_token JWT + refresh_token + objeto de
// usuário com identities/metadata) frequentemente ultrapassa isso —
// usar SecureStore como storage direto da sessão inteira é um risco
// real de falha de persistência em produção, não teórico.
//
// Padrão adotado: LargeSecureStore — o mesmo adapter que a própria
// Supabase documenta pra Expo/React Native. Só a CHAVE de criptografia
// AES-256 (32 bytes, sempre cabe) fica no SecureStore (Keychain/
// Keystore, protegida pelo hardware); o valor da sessão em si fica no
// AsyncStorage, mas sempre CRIPTOGRAFADO — nunca em texto plano, e sem
// limite de tamanho relevante pro nosso caso. Resolve as duas
// exigências ao mesmo tempo (segurança E ausência de risco de payload
// grande), em vez de escolher uma só.
class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));

    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));

    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) {
      return null;
    }

    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));

    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return this.decrypt(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }
}

export const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
  auth: {
    storage: new LargeSecureStore(),
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
