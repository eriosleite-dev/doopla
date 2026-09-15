import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Share, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { colors, fonts, radii } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { apiBaseUrl } from '@/lib/env';
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
import {
  fetchArtistBookers,
  fetchArtistLinkRouting,
  updateArtistLinkRouting,
  type BookerOption,
  type LinkRoutingMode,
} from '@/lib/data/link-routing';
import { closeAccount, updateArtistProfileFields, updateProfileFields } from '@/lib/data/settings';
import {
  confirmWhatsappVerification,
  fetchWhatsappIdentitySnapshot,
  requestWhatsappVerification,
  revokeWhatsappVerification,
  type WhatsappIdentitySnapshot,
} from '@/lib/data/whatsapp-identity';
import type { ArtistProfile, ArtistSubscription } from '@/types/artistProfile';

type Phase = 'loading' | 'ready' | 'error';
// "Perfil público" saiu do beta (Settings V2, 14/09/2026) — vitrine
// pública é legado do modelo antigo de marketplace, não produto atual
// (mesma decisão já aplicada no painel Web). Sheet e formulário
// removidos daqui; a coluna/toggle no banco não foram apagados.
//
// "whatsapp" e "link" viraram gaps bloqueantes fechados nesta rodada
// (14/09/2026) — mesmo backend/RPCs/regras do Web, nenhum sistema
// paralelo. Ver whatsapp-identity.ts e link-routing.ts.
//
// "comunidade" saiu do beta (15/09/2026, auditoria de legado) — os 7
// toggles de "Privacidade na Comunidade" não têm efeito visível hoje
// (CommunityAuthorSnapshot equivalente no App não carrega bio/
// specialties/workTypes/instagramUrl/portfolioUrl; nenhum componente
// da Comunidade renderiza city/avatarUrl). CommunityPrivacySheet
// (abaixo) preservada — arquivo intocado, só sem SheetKey/row que a
// abra mais. Mesma decisão do painel Web, ver pro-configuracoes-view.tsx.
type SheetKey = 'perfil' | 'plano' | 'whatsapp' | 'link' | 'ajuda' | 'excluir' | null;

const PLAN_LABELS: Record<string, string> = { doopla: 'Doopla', pro: 'Doopla Pro' };

const WHATSAPP_STATUS_LABELS: Record<string, string> = {
  verified: 'Verificado',
  pending_verification: 'Verificação pendente',
  pending_replacement: 'Verificação pendente',
  revoked: 'Não verificado',
  unverified: 'Não verificado',
};

export default function ConfiguracoesScreen() {
  const { user, session, profile, signOut } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null);
  const [subscription, setSubscription] = useState<ArtistSubscription | null>(null);
  const [whatsappSnapshot, setWhatsappSnapshot] = useState<WhatsappIdentitySnapshot | null>(null);
  const [openSheet, setOpenSheet] = useState<SheetKey>(null);

  const load = useCallback(() => {
    if (!user) return;
    setPhase('loading');
    Promise.all([fetchArtistProfile(user.id), fetchArtistSubscription(user.id), fetchWhatsappIdentitySnapshot(user.id)])
      .then(([ap, sub, whatsapp]) => {
        setArtistProfile(ap);
        setSubscription(sub);
        setWhatsappSnapshot(whatsapp);
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

  // Ajuste de proteção (14/09/2026, achado da fundadora, mesma regra
  // aplicada no Web): o primeiro toque na linha nunca pode ir direto
  // pro formulário com senha — passa por uma confirmação nativa antes
  // (mesmo padrão já usado em confirmSignOut acima). Só confirmando
  // aqui é que o BottomSheet com DeleteAccountSheet (senha + checkbox
  // + submit real, lógica intocada) abre.
  function confirmDeleteAccount() {
    Alert.alert('Excluir minha conta?', 'Esta ação excluirá permanentemente sua conta e não poderá ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir minha conta', style: 'destructive', onPress: () => setOpenSheet('excluir') },
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
            <SettingsRow
              label="WhatsApp"
              sub={whatsappSnapshot ? WHATSAPP_STATUS_LABELS[whatsappSnapshot.status] : 'Não verificado'}
              onPress={() => setOpenSheet('whatsapp')}
            />
            <SettingsRow label="Seu link de booking" onPress={() => setOpenSheet('link')} />
            <SettingsRow label="Ajuda / Sobre a Doopla" onPress={() => setOpenSheet('ajuda')} />
            <SettingsRow label="Excluir minha conta" onPress={confirmDeleteAccount} last />
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
        {user && session && (
          <WhatsappVerificationSheet
            professionalId={user.id}
            accessToken={session.access_token}
            snapshot={whatsappSnapshot}
            onChanged={load}
          />
        )}
      </BottomSheet>

      <BottomSheet visible={openSheet === 'link'} onClose={() => setOpenSheet(null)}>
        {user && profile?.slug && <BookingLinkSheet artistId={user.id} slug={profile.slug} visible={openSheet === 'link'} />}
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

const WHATSAPP_CONFIRM_REASON_LABELS: Record<string, string> = {
  no_pending_challenge: 'Nenhuma verificação em aberto — peça um código novo.',
  expired: 'Esse código expirou — peça um novo.',
  too_many_attempts: 'Muitas tentativas erradas — peça um código novo.',
  invalid_code: 'Código incorreto.',
  number_claimed_by_another_professional: 'Esse número já está verificado por outra conta.',
};

// Gap bloqueante do beta (14/09/2026) — a camada de dados
// (whatsapp-identity.ts) já existia como Foundation, mas nenhuma tela
// jamais chamava request/confirm/revoke no App (comentário do próprio
// arquivo: "as telas ... continuam fora deste bloco"). Mesmos 3 passos
// e mesmas regras do painel Web (pro-whatsapp-identity-card.tsx):
// visualizar → telefone → código, nunca trata um número só digitado
// como identidade confiável até o código ser confirmado.
function WhatsappVerificationSheet({
  professionalId,
  accessToken,
  snapshot,
  onChanged,
}: {
  professionalId: string;
  accessToken: string;
  snapshot: WhatsappIdentitySnapshot | null;
  onChanged: () => void;
}) {
  const [step, setStep] = useState<'view' | 'phone' | 'code'>('view');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isVerified = snapshot?.status === 'verified';

  function handleRequest() {
    setSubmitting(true);
    setError(null);
    requestWhatsappVerification(phone, accessToken).then((result) => {
      setSubmitting(false);
      if (result.kind === 'error') {
        setError(result.error);
        return;
      }
      setInfo('Enviamos um código de 6 dígitos pro seu WhatsApp.');
      setStep('code');
    });
  }

  function handleConfirm() {
    setSubmitting(true);
    setError(null);
    confirmWhatsappVerification(professionalId, code)
      .then((result) => {
        setSubmitting(false);
        if (!result.confirmed) {
          setError(WHATSAPP_CONFIRM_REASON_LABELS[result.reason ?? ''] ?? 'Não foi possível confirmar o código.');
          return;
        }
        setStep('view');
        setPhone('');
        setCode('');
        setInfo(null);
        onChanged();
      })
      .catch(() => {
        setSubmitting(false);
        setError('Não foi possível confirmar agora. Tente de novo.');
      });
  }

  function handleRevoke() {
    setSubmitting(true);
    setError(null);
    revokeWhatsappVerification(professionalId)
      .then(() => {
        setSubmitting(false);
        onChanged();
      })
      .catch(() => {
        setSubmitting(false);
        setError('Não foi possível remover a verificação agora.');
      });
  }

  return (
    <View>
      <Text style={styles.sheetTitle}>Seu WhatsApp</Text>

      {step === 'view' && (
        <View>
          {isVerified ? (
            <>
              <Text style={styles.sheetText}>✓ WhatsApp verificado · {snapshot?.verifiedNumber}</Text>
              <View style={styles.rowActions}>
                <Pressable style={styles.ghostBtn} onPress={() => setStep('phone')}>
                  <Text style={styles.ghostBtnText}>Alterar número</Text>
                </Pressable>
                <Pressable style={styles.ghostBtn} disabled={submitting} onPress={handleRevoke}>
                  <Text style={styles.ghostBtnText}>Remover</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.sheetSubtext}>
                {snapshot?.status === 'pending_verification' || snapshot?.status === 'pending_replacement'
                  ? 'Verificação pendente — confirme o código enviado, ou peça um novo.'
                  : 'Ainda não verificado. Sem isso, a Doopla pode não reconhecer você automaticamente numa conversa.'}
              </Text>
              <Pressable style={styles.submit} onPress={() => setStep('phone')}>
                <Text style={styles.submitText}>Verificar WhatsApp</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {step === 'phone' && (
        <View>
          <Text style={styles.label}>Número (com DDD e código do país)</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+55 11 91234-5678"
            keyboardType="phone-pad"
            placeholderTextColor={colors.tx50}
          />
          <Pressable style={[styles.submit, (submitting || !phone) && styles.submitDisabled]} disabled={submitting || !phone} onPress={handleRequest}>
            <Text style={styles.submitText}>{submitting ? 'Enviando…' : 'Enviar código'}</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={() => setStep('view')}>
            <Text style={styles.ghostBtnText}>Cancelar</Text>
          </Pressable>
        </View>
      )}

      {step === 'code' && (
        <View>
          {info && <Text style={styles.sheetSubtext}>{info}</Text>}
          <Text style={styles.label}>Código de 6 dígitos</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            placeholderTextColor={colors.tx50}
          />
          <Pressable
            style={[styles.submit, (submitting || code.length < 6) && styles.submitDisabled]}
            disabled={submitting || code.length < 6}
            onPress={handleConfirm}
          >
            <Text style={styles.submitText}>{submitting ? 'Confirmando…' : 'Confirmar'}</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={() => setStep('phone')}>
            <Text style={styles.ghostBtnText}>Reenviar</Text>
          </Pressable>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

// Gap bloqueante do beta (14/09/2026) — o link individual de
// booking/orçamento (canal de entrada de cliente sem login, preservado
// como produto atual — não é Perfil Público/vitrine) não tinha NENHUMA
// tela no App: nem pra ver/copiar o link, nem pra escolher quem recebe
// os pedidos. Mesma tabela/regra do Web (artist_link_routing).
function BookingLinkSheet({ artistId, slug, visible }: { artistId: string; slug: string; visible: boolean }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [mode, setMode] = useState<LinkRoutingMode>('eu');
  const [bookerId, setBookerId] = useState<string | null>(null);
  const [bookers, setBookers] = useState<BookerOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoCopied, setInfoCopied] = useState(false);

  const orcamentoUrl = `${apiBaseUrl()}/orcamento/${slug}`;

  const load = useCallback(() => {
    setPhase('loading');
    setError(null);
    setSaved(false);
    Promise.all([fetchArtistLinkRouting(artistId), fetchArtistBookers(artistId)])
      .then(([routing, bookerOptions]) => {
        setMode(routing?.mode ?? 'eu');
        setBookerId(routing?.bookerId ?? null);
        setBookers(bookerOptions);
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, [artistId]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [visible, load]);

  async function copyLink() {
    await Clipboard.setStringAsync(orcamentoUrl);
    setSaved(false);
    setInfoCopied(true);
    setTimeout(() => setInfoCopied(false), 2200);
  }

  function shareLink() {
    Share.share({ message: orcamentoUrl }).catch(() => {});
  }

  function submitRouting(nextMode: LinkRoutingMode, nextBookerId: string | null) {
    setSubmitting(true);
    setError(null);
    setSaved(false);
    updateArtistLinkRouting(artistId, nextMode, nextBookerId).then((result) => {
      setSubmitting(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode(nextMode);
      setBookerId(nextBookerId);
      setSaved(true);
    });
  }

  if (phase === 'loading') return <LoadingState label="Carregando…" />;
  if (phase === 'error') return <ErrorState message="Não conseguimos carregar seu link agora." onRetry={load} />;

  return (
    <View>
      <Text style={styles.sheetTitle}>Seu link de booking</Text>
      <Text style={styles.sheetSubtext}>
        A porta de entrada pro cliente iniciar um booking com você — não é um perfil público.
      </Text>

      <View style={styles.linkBox}>
        <Text style={styles.linkText}>{orcamentoUrl}</Text>
      </View>
      <View style={styles.rowActions}>
        <Pressable style={styles.ghostBtn} onPress={copyLink}>
          <Text style={styles.ghostBtnText}>{infoCopied ? 'Copiado!' : 'Copiar link'}</Text>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={shareLink}>
          <Text style={styles.ghostBtnText}>Compartilhar</Text>
        </Pressable>
      </View>

      <Text style={[styles.label, { marginTop: 20 }]}>Quem recebe seus pedidos de orçamento</Text>
      <RoutingOption
        label="Decidir caso a caso"
        hint="As solicitações chegam pra você primeiro."
        active={mode === 'eu'}
        onPress={() => submitRouting('eu', null)}
      />
      {bookers.length > 0 && (
        <>
          <RoutingOption
            label="Enviar automático pro meu booker"
            hint="As solicitações vão direto pro booker escolhido."
            active={mode === 'meu_booker'}
            onPress={() => submitRouting('meu_booker', bookerId ?? bookers[0].profileId)}
          />
          <RoutingOption
            label="Eu e meu booker acompanhamos juntos"
            hint="As solicitações aparecem pros dois."
            active={mode === 'eu_e_meu_booker'}
            onPress={() => submitRouting('eu_e_meu_booker', bookerId ?? bookers[0].profileId)}
          />
          {mode !== 'eu' && (
            <View style={styles.chips}>
              {bookers.map((b) => (
                <Pressable
                  key={b.profileId}
                  onPress={() => submitRouting(mode, b.profileId)}
                  style={[styles.chip, bookerId === b.profileId && styles.chipActive]}
                >
                  <Text style={[styles.chipText, bookerId === b.profileId && styles.chipTextActive]}>{b.fullName}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
      {bookers.length === 0 && (
        <Text style={styles.gapNote}>Nenhum booker te representa ainda — assim que tiver um, aparece aqui como opção.</Text>
      )}

      {submitting && <Text style={styles.sheetSubtext}>Salvando…</Text>}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {saved && !error && !submitting && <Text style={styles.savedText}>Salvo.</Text>}
    </View>
  );
}

function RoutingOption({ label, hint, active, onPress }: { label: string; hint: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.routingOption, active && styles.routingOptionActive]} onPress={onPress}>
      <View style={[styles.radio, active && styles.radioActive]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.routingLabel}>{label}</Text>
        <Text style={styles.routingHint}>{hint}</Text>
      </View>
    </Pressable>
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
// o sheet (não no load() da tela toda), só por escopo — não é o que
// evita ativação. Refaz a busca toda vez que o sheet reabre, pra nunca
// mostrar valor desatualizado depois de fechar/reabrir.
//
// Correção 14/09/2026: abrir/ver este sheet NUNCA ativa participação
// sozinho — load() só chama fetchMyCommunityProfile (leitura pura;
// `null` é estado real de "nunca ativou", mostrado com os 7 toggles
// desmarcados, nunca erro). ensureCommunityProfileActivated só roda
// dentro de submit(), no momento em que o profissional de fato salva
// uma preferência — a ação explícita que conta como "participar".
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

  // Correção 14/09/2026 (achado da fundadora durante a Categoria B):
  // abrir este sheet pra VER as preferências nunca pode ativar
  // participação sozinho — só leitura pura (fetchMyCommunityProfile).
  // `null` aqui é um estado real (nunca entrou na Comunidade ainda),
  // não erro — mostra os 7 toggles desmarcados normalmente. A ativação
  // (ensureCommunityProfileActivated) só acontece dentro de submit(),
  // no momento em que o profissional de fato salva uma preferência.
  const load = useCallback(() => {
    setPhase('loading');
    setError(null);
    setSaved(false);
    fetchMyCommunityProfile()
      .then((profile) => {
        setSnapshot(profile);
        setValues(
          profile
            ? {
                showCity: profile.showCity,
                showAvatar: profile.showAvatar,
                showBio: profile.showBio,
                showSpecialties: profile.showSpecialties,
                showWorkTypes: profile.showWorkTypes,
                showInstagram: profile.showInstagram,
                showPortfolio: profile.showPortfolio,
              }
            : {
                showCity: false,
                showAvatar: false,
                showBio: false,
                showSpecialties: false,
                showWorkTypes: false,
                showInstagram: false,
                showPortfolio: false,
              }
        );
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
    setSubmitting(true);
    setError(null);
    setSaved(false);
    ensureCommunityProfileActivated()
      .then(() => updateCommunityProfile({ availableForReferrals: snapshot?.availableForReferrals ?? false, ...values }))
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
  rowActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  ghostBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  ghostBtnText: { color: colors.off, fontFamily: fonts.subBold, fontSize: 12 },
  linkBox: {
    marginTop: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: 12,
  },
  linkText: { color: colors.off, fontFamily: fonts.mono, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8, marginLeft: 28 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.red, borderColor: colors.red },
  chipText: { color: colors.tx70, fontFamily: fonts.subSemiBold, fontSize: 11 },
  chipTextActive: { color: colors.off },
  routingOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: 12,
    marginTop: 8,
  },
  routingOptionActive: { borderColor: colors.red },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.line, marginTop: 2 },
  radioActive: { borderColor: colors.red, backgroundColor: colors.red },
  routingLabel: { color: colors.off, fontFamily: fonts.subSemiBold, fontSize: 12.5 },
  routingHint: { color: colors.tx50, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
});
