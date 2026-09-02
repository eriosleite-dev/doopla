import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';
import { mockDecisionContent, type DecisionModalKind } from '@/data/homeMock';
import { useToast } from '@/components/shared/Toast';

// Conteúdo dos 3 modais/bottom sheets do protótipo (detalhes da
// conversa, decidir-Marina, decidir-Alma). A recomendação da Doopla
// aqui é só sugestão visual — nenhuma ação de fato confirma nada
// ainda (Approval Engine não está conectado nesta fase).
export function DecisionSheetContent({ kind, onDone }: { kind: DecisionModalKind; onDone: () => void }) {
  const { show } = useToast();
  const content = mockDecisionContent[kind];

  if (kind === 'conversation') {
    const c = mockDecisionContent.conversation;
    return (
      <View>
        <Text style={styles.title}>{c.title}</Text>
        <Text style={styles.meta}>{c.meta}</Text>
        <View style={{ marginTop: 12, gap: 8 }}>
          {c.messages.map((m, i) => (
            <Text key={i} style={styles.message}>
              <Text style={styles.messageAuthor}>{m.author}:</Text> {m.text}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  const decision = content as typeof mockDecisionContent['decide-marina'];
  return (
    <View>
      <Text style={styles.title}>{decision.title}</Text>
      <Text style={styles.meta}>{decision.meta}</Text>
      <View style={styles.recommendation}>
        <Text style={styles.recommendationText}>{decision.recommendation}</Text>
      </View>
      <View style={styles.actions}>
        {decision.actions.map((action) => (
          <Pressable
            key={action.label}
            style={action.kind === 'solid' ? styles.btnSolid : styles.btnOutline}
            onPress={() => {
              show(action.toast);
              onDone();
            }}
          >
            <Text style={action.kind === 'solid' ? styles.btnSolidText : styles.btnOutlineText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 15,
  },
  meta: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  message: {
    color: colors.tx70,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
  },
  messageAuthor: {
    color: colors.off,
    fontFamily: fonts.bodySemiBold,
  },
  recommendation: {
    backgroundColor: 'rgba(255,255,255,.05)',
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 14,
  },
  recommendationText: {
    color: colors.off,
    fontFamily: fonts.body,
    fontSize: 12.5,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  btnSolid: {
    backgroundColor: colors.red,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  btnSolidText: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 12.5,
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  btnOutlineText: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 12.5,
  },
});
