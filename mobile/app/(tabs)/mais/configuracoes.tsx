import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { LoadingState, ErrorState } from '@/components/shared/ScreenState';
import { BottomSheet } from '@/components/shared/BottomSheet';
import { ChevronRightIcon } from '@/components/icons/Icons';
import { fetchArtistProfile, fetchArtistSubscription } from '@/lib/data/artistProfile';
import {
  ensureCommunityProfileActivated,
  fetchMyCommunityProfile,
  updateCommunityProfile,
  type CommunityProfileSnapshot,
} from '@/lib/data/community';
import { closeAccount, updateArtistProfileFields, updateProfileFields } from '@/lib/data/settings';
import type { ArtistProfile, ArtistSubscription } from '@/types/artistProfile';

type Phase = 'loading' | 'ready' | 'error';
type SheetKey = 'perfil' | 'plano' | 'whatsapp' | 'publico' | 'comunidade' | 'ajuda' | 'excluir' | null;

const PLAN_LABELS: Record<string, string> = { doopla: 'Doopla', pro: 'Doopla Pro' };

export default function ConfiguracoesScreen() {
  const { user, session, profile, signOut } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null);
  const [subscription, setSubscription] = useState<ArtistSubscription | null>(null);
  const [openSheet, setOpenSheet] = useState<SheetKey>(null);

  const load = useCallback(() => {
    if (!user) return;
    setPhase('loading');
    Promise.all([fetchArtistProfile(user.id), fetchArtistSubscription(user.id)])
      .then(([ap, sub]) => {
        setArtistProfile(ap);
        setSubscription(sub);
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function confirmSignOut() {
    Alert.alert('Sair da conta', 'Tem certeza que quer sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Configurações</Text>
      </View>

      {phase === 'loading' && <LoadingState label="Carregando…" />}
      {phase === 'error' && <ErrorState message="Não conseguimos carregar suas configurações agora." onRetry={load} />}

      {phase === 'ready' && (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.list}>
            <SettingsRow label="Conta e perfil" sub={profile?.full_name ?? undefined} onPress={() => setOpenSheet('perfil')} />
            <SettingsRow label="Plano" sub={subscription?.artist_plan ? PLAN_LABELS[subscription.artist_plan] : undefined} onPress={() => setOpenSheet('plano')} />
            <SettingsRow label="WhatsApp" sub={profile?.phone ?? 'Não cadastrado'} onPress={() => setOpenSheet('whatsapp')} />
            <SettingsRow label="Perfil público" sub={artistProfile?.public_enabled ? 'Ativo' : 'Desativado'} onPress={() => setOpenSheet('publico')} />
            <SettingsRow label="Privacidade na Comunidade" onPress={() => setOpenSheet('comunidade')} />
            <SettingsRow label="Ajuda / Sobre a Doopla" onPress={() => setOpenSheet('ajuda')} />
            <SettingsRow label="Excluir minha conta" onPress={() => setOpenSheet('excluir')} last />
          </View>

          <Pressable style={styles.signOutBtn} onPress={confirmSignOut}>
            <Text style={styles.signOutText}>Sair da conta</Text>
          </Pressable>
        </ScrollView>
      )}

      <BottomSheet visible={openSheet === 'perfil'} onClose={() => setOpenSheet(null)}>
        {user && artistProfile && (
          <ProfileForm
            profileId={user.id}
            city={profile?.city ?? ''}
            stageName={artistProfile.stage_name ?? ''}
            bio={artistProfile.bio ?? ''}
            onSaved={() => {
              setOpenSheet(null);
              load();
            }}
          />
        )}
      </BottomSheet>

      <BottomSheet visible={openSheet === 'plano'} onClose={() => setOpenSheet(null)}>
        <View>
          <Text style={styles.sheetTitle}>Plano</Text>
          <Text style={styles.sheetText}>
            {subscription?.artist_plan ? PLAN_LABELS[subscription.artist_plan] : 'Sem plano configurado'} ·{' '}
            {subscription?.status === 'trialing' ? 'Em teste' : subscription?.status === 'active' ? 'Ativo' : 'Cancelado'}
          </Text>
          {subscription?.status === 'trialing' && subscription.trial_ends_at && (
            <Text style={styles.sheetSubtext}>Teste até {subscription.trial_ends_at}</Text>
          )}
        </View>
      </BottomSheet>

      <BottomSheet visible={openSheet === 'whatsapp'} onClose={() => setOpenSheet(null)}>
        <View>
          <Text style={styles.sheetTitle}>WhatsApp</Text>
          <Text style={styles.sheetText}>{profile?.phone ?? 'Nenhum número cadastrado'}</Text>
          <Text style={styles.gapNote}>
            Ainda não existe verificação de posse do número no app — o que está aqui é só o número cadastrado na sua conta,
            sem selo de &ldquo;verificado&rdquo;.
          </Text>
        </View>
      </BottomSheet>

      <BottomSheet visible={openSheet === 'publico'} onClose={() => setOpenSheet(null)}>
        {user && artistProfile && (
          <PublicProfileForm
            profileId={user.id}
            artistProfile={artistProfile}
            onSaved={() => {
              setOpenSheet(null);
              load();
            }}
          />
        )}
      </BottomSheet>

      <BottomSheet visible={openSheet === 'comunidade'} onClose={() => setOpenSheet(null)}>
        <CommunityPrivacySheet visible={openSheet === 'comunidade'} />
      </BottomSheet>

      <BottomSheet visible={openSheet === 'ajuda'} onClose={() => setOpenSheet(null)}>
        <View>
          <Text style={styles.sheetTitle}>Sobre a Doopla</Text>
          <Text style={styles.aiDisclaimer}>
            A Doopla usa inteligência artificial e pode cometer erros. Você continua no controle e aprova decisões
            importantes.
          </Text>
        </View>
      </BottomSheet>

      <BottomSheet visible={openSheet === 'excluir'} onClose={() => setOpenSheet(null)}>
        {session && <DeleteAccountSheet accessToken={session.access_token} onClosed={signOut} />}
      </BottomSheet>
    </SafeAreaView>
  );
}

function SettingsRow({ label, sub, onPress, last }: { label: string; sub?: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable style={[styles.row, !last && styles.rowBordered]} onPress={onPress}>
      <View>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <ChevronRightIcon size={16} color={colors.tx30} />
    </Pressable>
  );
}

function ProfileForm({
  profileId,
  city,
  stageName,
  bio,
  onSaved,
}: {
  profileId: string;
  city: string;
  stageName: string;
  bio: string;
  onSaved: () => void;
}) {
  const [cityValue, setCityValue] = useState(city);
  const [stageNameValue, setStageNameValue] = useState(stageName);
  const [bioValue, setBioValue] = useState(bio);
  const [submitting, setSubmitting] = useState(false);

  function submit() {
    setSubmitting(true);
    Promise.all([
      updateProfileFields(profileId, { city: cityValue.trim() || null }),
      updateArtistProfileFields(profileId, { stage_name: stageNameValue.trim() || null, bio: bioValue.trim() || null }),
    ])
      .then(() => {
        setSubmitting(false);
        onSaved();
      })
      .catch(() => setSubmitting(false));
  }

  return (
    <View>
      <Text style={styles.sheetTitle}>Conta e perfil</Text>
      <Text style={styles.label}>Nome profissional</Text>
      <TextInput style={styles.input} value={stageNameValue} onChangeText={setStageNameValue} placeholderTextColor={colors.tx50} />
      <Text style={styles.label}>Cidade</Text>
      <TextInput style={styles.input} value={cityValue} onChangeText={setCityValue} placeholderTextColor={colors.tx50} />
      <Text style={styles.label}>Bio</Text>
      <TextInput style={[styles.input, styles.multiline]} value={bioValue} onChangeText={setBioValue} multiline placeholderTextColor={colors.tx50} />
      <Pressable style={[styles.submit, submitting && styles.submitDisabled]} disabled={submitting} onPress={submit}>
        <Text style={styles.submitText}>{submitting ? 'Salvando…' : 'Salvar'}</Text>
      </Pressable>
    </View>
  );
}

function PublicProfileForm({
  profileId,
  artistProfile,
  onSaved,
}: {
  profileId: string;
  artistProfile: ArtistProfile;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(artistProfile.public_enabled);
  const [instagram, setInstagram] = useState(artistProfile.instagram_url ?? '');
  const [portfolio, setPortfolio] = useState(artistProfile.portfolio_url ?? '');
  const [submitting, setSubmitting] = useState(false);

  function submit() {
    setSubmitting(true);
    updateArtistProfileFields(profileId, {
      public_enabled: enabled,
      instagram_url: instagram.trim() || null,
      portfolio_url: portfolio.trim() || null,
    })
      .then(() => {
        setSubmitting(false);
        onSaved();
      })
      .catch(() => setSubmitting(false));
  }

  return (
    <View>
      <Text style={styles.sheetTitle}>Perfil público</Text>
      <View style={styles.toggleRow}>
        <Text style={styles.label}>Perfil público ativo</Text>
        <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: colors.red }} />
      </View>
      <Text style={styles.label}>Instagram</Text>
      <TextInput style={styles.input} value={instagram} onChangeText={setInstagram} placeholder="https://instagram.com/…" placeholderTextColor={colors.tx50} />
      <Text style={styles.label}>Portfólio</Text>
      <TextInput style={styles.input} value={portfolio} onChangeText={setPortfolio} placeholder="https://…" placeholderTextColor={colors.tx50} />
      <Pressable style={[styles.submit, submitting && styles.submitDisabled]} disabled={submitting} onPress={submit}>
        <Text style={styles.submitText}>{submitting ? 'Salvando…' : 'Salvar'}</Text>
      </Pressable>
    </View>
  );
}

type CommunityToggleKey = 'showCity' | 'showAvatar' | 'showBio' | 'showSpecialties' | 'showWorkTypes' | 'showInstagram' | 'showPortfolio';

const COMMUNITY_TOGGLES: { key: CommunityToggleKey; label: string }[] = [
  { key: 'showCity', label: 'Mostrar minha cidade' },
  { key: 'showAvatar', label: 'Mostrar minha foto' },
  { key: 'showBio', label: 'Mostrar minha bio' },
  { key: 'showSpecialties', label: 'Mostrar minhas especialidades' },
  { key: 'showWorkTypes', label: 'Mostrar tipos de trabalho' },
  { key: 'showInstagram', label: 'Mostrar meu Instagram' },
  { key: 'showPortfolio', label: 'Mostrar meu portfólio' },
];

// Bloco 7, P1 (09/09/2026) — mesma feature nova do painel web (ver
// src/app/dashboard/perfil/privacidade/comunidade/), reutilizando a
// mesma data layer já existente em mobile/src/lib/data/community.ts
// (fetchMyCommunityProfile/updateCommunityProfile/
// ensureCommunityProfileActivated — cópia deliberada de
// src/lib/community/data.ts, mesmo backend/RPC/RLS). Busca só ao abrir
// o sheet (não no load() da tela toda) — abrir Configurações não deve
// silenciosamente ativar a participação na Comunidade; só entrar
// NESTE sheet especificamente é uma ação relacionada à Comunidade.
// Refaz a busca toda vez que o sheet reabre, pra nunca mostrar valor
// desatualizado depois de fechar/reabrir.
//
// availableForReferrals nunca vira toggle aqui (não é um dos 7 campos
// pedidos) — só é lido do snapshot atual e reenviado sem alteração no
// submit, pela mesma razão documentada na action do Web: a RPC exige
// os 8 parâmetros juntos, sem update parcial.
function CommunityPrivacySheet({ visible }: { visible: boolean }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [snapshot, setSnapshot] = useState<CommunityProfileSnapshot | null>(null);
  const [values, setValues] = useState<Record<CommunityToggleKey, boolean>>({
    showCity: false,
    showAvatar: false,
    showBio: false,
    showSpecialties: false,
    showWorkTypes: false,
    showInstagram: false,
    showPortfolio: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setPhase('loading');
    setError(null);
    setSaved(false);
    ensureCommunityProfileActivated()
      .then(() => fetchMyCommunityProfile())
      .then((profile) => {
        if (!profile) {
          setPhase('error');
          return;
        }
        setSnapshot(profile);
        setValues({
          showCity: profile.showCity,
          showAvatar: profile.showAvatar,
          showBio: profile.showBio,
          showSpecialties: profile.showSpecialties,
          showWorkTypes: profile.showWorkTypes,
          showInstagram: profile.showInstagram,
          showPortfolio: profile.showPortfolio,
        });
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [visible, load]);

  function submit() {
    if (!snapshot) return;
    setSubmitting(true);
    setError(null);
    setSaved(false);
    updateCommunityProfile({ availableForReferrals: snapshot.availableForReferrals, ...values })
      .then(() => {
        setSubmitting(false);
        setSaved(true);
      })
      .catch(() => {
        setSubmitting(false);
        setError('Não foi possível salvar agora. Tente novamente.');
      });
  }

  if (phase === 'loading') return <LoadingState label="Carregando…" />;
  if (phase === 'error') return <ErrorState message="Não conseguimos carregar suas preferências agora." onRetry={load} />;

  return (
    <View>
      <Text style={styles.sheetTitle}>Privacidade na Comunidade</Text>
      <Text style={styles.sheetSubtext}>
        O que outros profissionais veem no seu perfil público dentro da Comunidade — não afeta seu Perfil profissional
        geral na Doopla.
      </Text>
      <View style={{ marginTop: 12 }}>
        {COMMUNITY_TOGGLES.map((toggle) => (
          <View key={toggle.key} style={styles.toggleRow}>
            <Text style={styles.label}>{toggle.label}</Text>
            <Switch
              value={values[toggle.key]}
              onValueChange={(next) => setValues((prev) => ({ ...prev, [toggle.key]: next }))}
              trackColor={{ true: colors.red }}
            />
          </View>
        ))}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {saved && !error && <Text style={styles.savedText}>Salvo.</Text>}
      <Pressable style={[styles.submit, submitting && styles.submitDisabled]} disabled={submitting} onPress={submit}>
        <Text style={styles.submitText}>{submitting ? 'Salvando…' : 'Salvar'}</Text>
      </Pressable>
    </View>
  );
}

// Account closure flow (Settings V2, 08/09/2026) — mesma copy/regras
// do painel web (ver src/app/dashboard/perfil/privacidade/excluir/
// page.tsx): explica o que acontece ANTES de pedir confirmação, exige
// senha (reauth) + checkbox marcado, sem dark pattern. Sem cancelar
// dedicado — fechar o BottomSheet já cumpre esse papel.
function DeleteAccountSheet({ accessToken, onClosed }: { accessToken: string; onClosed: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setSubmitting(true);
    setError(null);
    closeAccount(password, accessToken).then((result) => {
      setSubmitting(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClosed();
    });
  }

  return (
    <View>
      <Text style={styles.sheetTitle}>Excluir sua conta é uma ação permanente.</Text>
      <Text style={styles.sheetText}>
        Sua assinatura é cancelada e a Doopla para de representar você. Bookings e contratos continuam existindo, intactos,
        pra preservar o histórico de quem trabalhou com você. Seu perfil na Comunidade passa a aparecer como &ldquo;Usuário
        removido&rdquo;, sem apagar discussões. Um cadastro novo com o mesmo e-mail no futuro é uma conta nova.
      </Text>
      <Text style={styles.label}>Digite sua senha pra confirmar</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholderTextColor={colors.tx50}
      />
      <Pressable style={styles.checkboxRow} onPress={() => setConfirmed((c) => !c)}>
        <View style={[styles.checkbox, confirmed && styles.checkboxChecked]} />
        <Text style={styles.checkboxLabel}>Entendo que esta ação é permanente.</Text>
      </Pressable>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Pressable
        style={[styles.deleteBtn, (!confirmed || submitting) && styles.submitDisabled]}
        disabled={!confirmed || submitting}
        onPress={submit}
      >
        <Text style={styles.deleteBtnText}>{submitting ? 'Excluindo…' : 'Excluir minha conta'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { color: colors.off, fontFamily: fonts.subBold, fontSize: 21 },
  body: { padding: 16, paddingBottom: 32 },
  list: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBordered: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowLabel: { color: colors.off, fontFamily: fonts.subSemiBold, fontSize: 13.5 },
  rowSub: { color: colors.tx50, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  signOutBtn: { marginTop: 24, borderWidth: 1, borderColor: 'rgba(226,41,28,.4)', borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  signOutText: { color: '#ff8b80', fontFamily: fonts.subBold, fontSize: 13 },
  sheetTitle: { color: colors.off, fontFamily: fonts.subBold, fontSize: 15, marginBottom: 12 },
  sheetText: { color: colors.off, fontFamily: fonts.body, fontSize: 13 },
  sheetSubtext: { color: colors.tx50, fontFamily: fonts.body, fontSize: 11.5, marginTop: 6 },
  gapNote: { color: colors.tx30, fontFamily: fonts.body, fontSize: 10.5, lineHeight: 15, marginTop: 12 },
  aiDisclaimer: { color: colors.tx70, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19 },
  label: { color: colors.tx50, fontFamily: fonts.body, fontSize: 11, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: 'rgba(255,255,255,.05)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: 13,
    paddingVertical: 10,
    color: colors.off,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  submit: { backgroundColor: colors.red, borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 18 },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: colors.off, fontFamily: fonts.subBold, fontSize: 13 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: colors.line, marginTop: 1 },
  checkboxChecked: { backgroundColor: colors.red, borderColor: colors.red },
  checkboxLabel: { flex: 1, color: colors.tx50, fontFamily: fonts.body, fontSize: 12 },
  errorText: { color: '#ff8b80', fontFamily: fonts.body, fontSize: 12, marginTop: 10 },
  savedText: { color: colors.green, fontFamily: fonts.body, fontSize: 12, marginTop: 10 },
  deleteBtn: { backgroundColor: colors.red, borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 18 },
  deleteBtnText: { color: colors.off, fontFamily: fonts.subBold, fontSize: 13 },
});
