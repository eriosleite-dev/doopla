import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { LoadingState, ErrorState } from '@/components/shared/ScreenState';
import { BottomSheet } from '@/components/shared/BottomSheet';
import { ChevronRightIcon } from '@/components/icons/Icons';
import { fetchArtistProfile, fetchArtistSubscription } from '@/lib/data/artistProfile';
import { updateArtistProfileFields, updateProfileFields } from '@/lib/data/settings';
import type { ArtistProfile, ArtistSubscription } from '@/types/artistProfile';

type Phase = 'loading' | 'ready' | 'error';
type SheetKey = 'perfil' | 'plano' | 'whatsapp' | 'publico' | 'ajuda' | null;

const PLAN_LABELS: Record<string, string> = { doopla: 'Doopla', pro: 'Doopla Pro' };

export default function ConfiguracoesScreen() {
  const { user, profile, signOut } = useAuth();
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
    load();
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
            <SettingsRow label="Ajuda / Sobre a Doopla" onPress={() => setOpenSheet('ajuda')} last />
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
            sem selo de "verificado".
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

      <BottomSheet visible={openSheet === 'ajuda'} onClose={() => setOpenSheet(null)}>
        <View>
          <Text style={styles.sheetTitle}>Sobre a Doopla</Text>
          <Text style={styles.aiDisclaimer}>
            A Doopla usa inteligência artificial e pode cometer erros. Você continua no controle e aprova decisões
            importantes.
          </Text>
        </View>
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
});
