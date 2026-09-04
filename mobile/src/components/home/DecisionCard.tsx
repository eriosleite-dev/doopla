import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora há pouco';
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours}h`;
  return `Há ${Math.floor(hours / 24)}d`;
}

function blockReasonLabel(reason: string | null): string {
  if (!reason) return 'A Doopla está esperando uma decisão sua pra continuar essa conversa.';
  if (reason === 'professional_not_operationally_ready') {
    return 'Precisa confirmar alguns dados antes da Doopla continuar por você.';
  }
  return 'A Doopla pausou aqui e precisa de você pra seguir.';
}

// Card individual de "Precisa de você" — leitura sobre
// src/lib/data/decisions.ts (Foundation), nenhuma lógica nova de
// aprovação aqui. Sempre leva pra conversa real (Runtime/Approval/
// Policy Gate decidem o resto, nunca esta tela).
export function DecisionCard({
  otherPartyName,
  kind,
  blockReason,
  preparedContent,
  createdAt,
  onPress,
  bordered,
}: {
  otherPartyName: string;
  kind: 'pending_reply' | 'prepared_draft';
  blockReason: string | null;
  preparedContent: string | null;
  createdAt: string;
  onPress: () => void;
  bordered?: boolean;
}) {
  return (
    <View style={[styles.card, bordered && styles.bordered]}>
      <Text style={styles.name}>{otherPartyName}</Text>
      <Text style={styles.note}>
        {kind === 'prepared_draft' ? 'A Doopla preparou uma resposta. Revise antes de enviar.' : blockReasonLabel(blockReason)}
      </Text>
      {kind === 'prepared_draft' && preparedContent && (
        <Text style={styles.preview} numberOfLines={2}>
          &ldquo;{preparedContent}&rdquo;
        </Text>
      )}
      <Text style={styles.time}>{formatRelativeTime(createdAt)}</Text>
      <Pressable style={styles.btn} onPress={onPress}>
        <Text style={styles.btnText}>Ver conversa</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 12,
  },
  bordered: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  name: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 13.5,
    marginBottom: 3,
  },
  note: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 11.5,
    lineHeight: 16,
  },
  preview: {
    color: colors.tx70,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 11.5,
    marginTop: 6,
  },
  time: {
    color: colors.tx30,
    fontFamily: fonts.mono,
    fontSize: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.red,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  btnText: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 11.5,
  },
});
