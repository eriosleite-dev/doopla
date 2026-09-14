import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { colors, fonts, radii } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { LoadingState, ErrorState } from '@/components/shared/ScreenState';
import { useToast } from '@/components/shared/Toast';
import { formatCentsAsBRL, formatDatePt } from '@/lib/format';
import { fetchReferralSummary, type ReferralSummary } from '@/lib/data/referrals';
import type { ReferralStatus } from '@/types/referral';

type Phase = 'loading' | 'ready' | 'error';

const STATUS_LABELS: Record<ReferralStatus, string> = {
  pendente: 'Pendente',
  qualificada: 'Qualificada',
  invalida: 'Inválida',
};

export default function IndiqueEGanheScreen() {
  const { profile } = useAuth();
  const { show } = useToast();
  const [phase, setPhase] = useState<Phase>('loading');
  const [summary, setSummary] = useState<ReferralSummary | null>(null);

  const load = useCallback(() => {
    if (!profile?.referral_code) return;
    setPhase('loading');
    fetchReferralSummary(profile.id, profile.referral_code)
      .then((data) => {
        setSummary(data);
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const referralUrl = profile?.referral_code ? `https://doopla.com/cadastro?ref=${profile.referral_code}` : null;

  async function copy(text: string, label: string) {
    await Clipboard.setStringAsync(text);
    show(`${label} copiado.`);
  }

  async function shareInvite() {
    if (!referralUrl) return;
    try {
      await Share.share({ message: `Vem pra Doopla comigo: ${referralUrl}` });
    } catch {
      // usuário cancelou o share sheet — não é erro
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Indique e ganhe</Text>
        <Text style={styles.subtitle}>Compartilhe a Doopla com outros profissionais que você conhece.</Text>
      </View>

      {phase === 'loading' && <LoadingState label="Carregando…" />}
      {phase === 'error' && <ErrorState message="Não conseguimos carregar suas indicações agora." onRetry={load} />}

      {phase === 'ready' && summary && referralUrl && (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.linkCard}>
            <Text style={styles.linkLabel}>Seu link</Text>
            <Text style={styles.linkValue}>{referralUrl}</Text>
            <Pressable style={styles.copyBtn} onPress={() => copy(referralUrl, 'Link')}>
              <Text style={styles.copyBtnText}>Copiar link</Text>
            </Pressable>

            <Text style={[styles.linkLabel, { marginTop: 16 }]}>Seu código</Text>
            <Text style={styles.linkValue}>{summary.referralCode}</Text>
            <Pressable style={styles.copyBtn} onPress={() => copy(summary.referralCode, 'Código')}>
              <Text style={styles.copyBtnText}>Copiar código</Text>
            </Pressable>

            <Pressable style={styles.shareBtn} onPress={shareInvite}>
              <Text style={styles.shareBtnText}>Compartilhar convite</Text>
            </Pressable>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryValue}>{summary.referrals.length}</Text>
              <Text style={styles.summaryLabel}>Indicações</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryValue}>{summary.pendingCount}</Text>
              <Text style={styles.summaryLabel}>Pendentes</Text>
            </View>
          </View>

          <View style={styles.earningsCard}>
            {summary.qualifiedTotalCents > 0 ? (
              <Text style={styles.earningsValue}>{formatCentsAsBRL(summary.qualifiedTotalCents)}</Text>
            ) : (
              <Text style={styles.earningsEmpty}>Seus ganhos aparecerão aqui quando suas indicações forem qualificadas.</Text>
            )}
          </View>

          {summary.referrals.length > 0 && (
            <View style={styles.listCard}>
              <Text style={styles.listTitle}>Indicados</Text>
              {summary.referrals.map((r, i) => (
                <View key={r.id} style={[styles.listRow, i > 0 && styles.listBordered]}>
                  <View>
                    <Text style={styles.listName}>{r.referredName}</Text>
                    <Text style={styles.listDate}>{formatDatePt(r.created_at.slice(0, 10))}</Text>
                  </View>
                  <Text style={styles.listStatus}>{STATUS_LABELS[r.status]}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { color: colors.off, fontFamily: fonts.subBold, fontSize: 21, marginBottom: 6 },
  subtitle: { color: colors.tx50, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18 },
  body: { padding: 16, paddingBottom: 32 },
  linkCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
  },
  linkLabel: { color: colors.tx50, fontFamily: fonts.body, fontSize: 10.5 },
  linkValue: { color: colors.off, fontFamily: fonts.mono, fontSize: 12.5, marginTop: 4, marginBottom: 8 },
  copyBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
  copyBtnText: { color: colors.off, fontFamily: fonts.subBold, fontSize: 11.5 },
  shareBtn: { backgroundColor: colors.red, borderRadius: 999, paddingVertical: 11, alignItems: 'center', marginTop: 16 },
  shareBtnText: { color: colors.off, fontFamily: fonts.subBold, fontSize: 12.5 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryStat: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
  },
  summaryValue: { color: colors.off, fontFamily: fonts.display, fontSize: 20 },
  summaryLabel: { color: colors.tx50, fontFamily: fonts.body, fontSize: 10, marginTop: 2 },
  earningsCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  earningsValue: { color: colors.green, fontFamily: fonts.display, fontSize: 22 },
  earningsEmpty: { color: colors.tx50, fontFamily: fonts.body, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  listCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 16,
  },
  listTitle: { color: colors.off, fontFamily: fonts.subBold, fontSize: 13.5, marginBottom: 8 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
  listBordered: { borderTopWidth: 1, borderTopColor: colors.line },
  listName: { color: colors.off, fontFamily: fonts.subSemiBold, fontSize: 12.5 },
  listDate: { color: colors.tx50, fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
  listStatus: { color: colors.tx70, fontFamily: fonts.body, fontSize: 11 },
});
