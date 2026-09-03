import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { LoadingState, ErrorState } from '@/components/shared/ScreenState';
import { BottomSheet } from '@/components/shared/BottomSheet';
import { formatCentsAsBRL, formatDatePt } from '@/lib/format';
import { computeArtistStats, fetchUserBookings, type ArtistStats } from '@/lib/data/bookings';
import {
  computeAvailableToWithdraw,
  fetchActivePaymentDetails,
  fetchPayoutRequests,
  maskPixKey,
  requestPayout,
  setPaymentDetails,
} from '@/lib/data/payments';
import type { PaymentDetails, PayoutRequest, PixKeyType } from '@/types/payment';

type Phase = 'loading' | 'ready' | 'error';

const PIX_KEY_TYPES: { key: PixKeyType; label: string }[] = [
  { key: 'cpf', label: 'CPF' },
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'email', label: 'E-mail' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'aleatoria', label: 'Aleatória' },
];

export default function DinheiroScreen() {
  const { professionalId } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [paymentDetails, setPaymentDetailsState] = useState<PaymentDetails | null>(null);
  const [stats, setStats] = useState<ArtistStats | null>(null);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [payoutSheetOpen, setPayoutSheetOpen] = useState(false);

  const load = useCallback(() => {
    if (!professionalId) return;
    setPhase('loading');
    Promise.all([fetchActivePaymentDetails(professionalId), fetchUserBookings(professionalId), fetchPayoutRequests(professionalId)])
      .then(([details, bookings, requests]) => {
        setPaymentDetailsState(details);
        setStats(computeArtistStats(bookings));
        setPayoutRequests(requests);
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, [professionalId]);

  useEffect(() => {
    load();
  }, [load]);

  const availableCents = stats ? computeAvailableToWithdraw(stats.netReceivedCents, payoutRequests) : 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Dinheiro</Text>
      </View>

      {phase === 'loading' && <LoadingState label="Carregando…" />}
      {phase === 'error' && <ErrorState message="Não conseguimos carregar seus dados financeiros agora." onRetry={load} />}

      {phase === 'ready' && stats && (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Dados de recebimento</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, paymentDetails ? styles.dotOk : styles.dotPending]} />
              <Text style={styles.statusText}>{paymentDetails ? 'Configurado' : 'Falta configurar'}</Text>
            </View>
            {paymentDetails && (
              <Text style={styles.pixValue}>
                {PIX_KEY_TYPES.find((t) => t.key === paymentDetails.pix_key_type)?.label ?? 'Pix'} ·{' '}
                {maskPixKey(paymentDetails.pix_key_type, paymentDetails.pix_key)}
              </Text>
            )}
            <Pressable style={styles.editBtn} onPress={() => setEditSheetOpen(true)}>
              <Text style={styles.editBtnText}>Editar dados de recebimento</Text>
            </Pressable>
            <Text style={styles.protectionCopy}>
              Seus dados de recebimento ficam protegidos na sua conta Doopla. Qualquer dúvida, é só me perguntar.
            </Text>
          </View>

          {!paymentDetails && (
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>Configure seus dados de recebimento pra Doopla conseguir operar por você.</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Valores</Text>
            <View style={styles.statsGrid}>
              <Stat label="Disponível" value={formatCentsAsBRL(availableCents)} />
              <Stat label="Recebido no mês" value={formatCentsAsBRL(stats.monthNetReceivedCents)} />
              <Stat label="Total recebido" value={formatCentsAsBRL(stats.netReceivedCents)} />
              <Stat label="Bookings pagos" value={String(stats.closedCount)} />
            </View>
            {availableCents > 0 && (
              <Pressable style={styles.editBtn} onPress={() => setPayoutSheetOpen(true)}>
                <Text style={styles.editBtnText}>Solicitar saque</Text>
              </Pressable>
            )}
          </View>

          {payoutRequests.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Solicitações de saque</Text>
              {payoutRequests.map((r, i) => (
                <View key={r.id} style={[styles.payoutRow, i > 0 && styles.payoutBordered]}>
                  <Text style={styles.payoutValue}>{formatCentsAsBRL(r.amount_cents)}</Text>
                  <Text style={styles.payoutMeta}>
                    Solicitado · {formatDatePt(r.created_at.slice(0, 10))}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <BottomSheet visible={editSheetOpen} onClose={() => setEditSheetOpen(false)}>
        <PaymentDetailsForm
          initial={paymentDetails}
          onSaved={() => {
            setEditSheetOpen(false);
            load();
          }}
        />
      </BottomSheet>

      <BottomSheet visible={payoutSheetOpen} onClose={() => setPayoutSheetOpen(false)}>
        <RequestPayoutForm
          professionalId={professionalId}
          availableCents={availableCents}
          onSaved={() => {
            setPayoutSheetOpen(false);
            load();
          }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PaymentDetailsForm({ initial, onSaved }: { initial: PaymentDetails | null; onSaved: () => void }) {
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>(initial?.pix_key_type ?? 'cpf');
  const [pixKey, setPixKey] = useState(initial?.pix_key ?? '');
  const [holderName, setHolderName] = useState(initial?.holder_name ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!pixKey.trim() || !holderName.trim()) {
      setError('Preencha a chave Pix e o nome do titular.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setPaymentDetails({ pixKeyType, pixKey: pixKey.trim(), holderName: holderName.trim() })
      .then(() => {
        setSubmitting(false);
        onSaved();
      })
      .catch(() => {
        setSubmitting(false);
        setError('Não foi possível salvar. Confira os dados e tente de novo.');
      });
  }

  return (
    <View>
      <Text style={styles.formTitle}>Dados de recebimento</Text>
      <Text style={styles.label}>Tipo de chave</Text>
      <View style={styles.chips}>
        {PIX_KEY_TYPES.map((t) => {
          const active = t.key === pixKeyType;
          return (
            <Pressable key={t.key} onPress={() => setPixKeyType(t.key)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.label}>Chave Pix</Text>
      <TextInput style={styles.input} value={pixKey} onChangeText={setPixKey} placeholder="Sua chave Pix" placeholderTextColor={colors.tx50} />
      <Text style={styles.label}>Nome do titular</Text>
      <TextInput style={styles.input} value={holderName} onChangeText={setHolderName} placeholder="Nome completo" placeholderTextColor={colors.tx50} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.submit, submitting && styles.submitDisabled]} disabled={submitting} onPress={submit}>
        <Text style={styles.submitText}>{submitting ? 'Salvando…' : 'Salvar'}</Text>
      </Pressable>
    </View>
  );
}

function RequestPayoutForm({
  professionalId,
  availableCents,
  onSaved,
}: {
  professionalId: string | null;
  availableCents: number;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!professionalId) return;
    const cents = Math.round(Number(amount.replace(',', '.')) * 100);
    if (!cents || cents <= 0) {
      setError('Informe um valor válido.');
      return;
    }
    if (cents > availableCents) {
      setError('O valor solicitado é maior do que o disponível para saque.');
      return;
    }
    setSubmitting(true);
    setError(null);
    requestPayout(professionalId, cents)
      .then(() => {
        setSubmitting(false);
        onSaved();
      })
      .catch(() => {
        setSubmitting(false);
        setError('Não foi possível registrar o pedido agora.');
      });
  }

  return (
    <View>
      <Text style={styles.formTitle}>Solicitar saque</Text>
      <Text style={styles.label}>Disponível: {formatCentsAsBRL(availableCents)}</Text>
      <TextInput
        style={[styles.input, { marginTop: 12 }]}
        value={amount}
        onChangeText={setAmount}
        placeholder="0,00"
        placeholderTextColor={colors.tx50}
        keyboardType="decimal-pad"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.submit, submitting && styles.submitDisabled]} disabled={submitting} onPress={submit}>
        <Text style={styles.submitText}>{submitting ? 'Enviando…' : 'Solicitar'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { color: colors.off, fontFamily: fonts.subBold, fontSize: 21 },
  body: { padding: 16, paddingBottom: 32 },
  section: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: { color: colors.off, fontFamily: fonts.subBold, fontSize: 13.5, marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotOk: { backgroundColor: colors.green },
  dotPending: { backgroundColor: colors.amber },
  statusText: { color: colors.off, fontFamily: fonts.subSemiBold, fontSize: 12.5 },
  pixValue: { color: colors.tx70, fontFamily: fonts.mono, fontSize: 11.5, marginTop: 8 },
  editBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 10, alignItems: 'center', marginTop: 12 },
  editBtnText: { color: colors.off, fontFamily: fonts.subBold, fontSize: 12 },
  protectionCopy: { color: colors.tx30, fontFamily: fonts.body, fontSize: 10.5, lineHeight: 15, marginTop: 12 },
  warningCard: {
    backgroundColor: 'rgba(245,166,35,.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,.3)',
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 12,
  },
  warningText: { color: colors.amber, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { width: '45%' },
  statValue: { color: colors.off, fontFamily: fonts.display, fontSize: 17 },
  statLabel: { color: colors.tx50, fontFamily: fonts.body, fontSize: 10, marginTop: 2 },
  payoutRow: { paddingVertical: 8 },
  payoutBordered: { borderTopWidth: 1, borderTopColor: colors.line },
  payoutValue: { color: colors.off, fontFamily: fonts.subBold, fontSize: 13 },
  payoutMeta: { color: colors.tx50, fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
  formTitle: { color: colors.off, fontFamily: fonts.subBold, fontSize: 15, marginBottom: 14 },
  label: { color: colors.tx50, fontFamily: fonts.body, fontSize: 11, marginBottom: 6, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.red, borderColor: colors.red },
  chipText: { color: colors.tx70, fontFamily: fonts.subSemiBold, fontSize: 11 },
  chipTextActive: { color: colors.off },
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
  error: { color: '#ff8b80', fontFamily: fonts.body, fontSize: 11.5, marginTop: 12 },
  submit: { backgroundColor: colors.red, borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 18 },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: colors.off, fontFamily: fonts.subBold, fontSize: 13 },
});
