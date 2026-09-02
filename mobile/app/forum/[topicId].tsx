import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { FullSheetHeader } from '@/components/shared/FullSheetHeader';
import { SendIcon } from '@/components/icons/Icons';
import { ErrorState } from '@/components/shared/ScreenState';
import { mockForumMessages, mockForumTopics } from '@/data/forumMock';

type SendPhase = 'idle' | 'sending' | 'error';

// Envio mockado (sem backend ainda) só pra deixar os estados de
// envio/falha-com-retry navegáveis, como pede o prompt do layout.
function mockSend(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

export default function ForumConversationScreen() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const router = useRouter();
  const topic = useMemo(() => mockForumTopics.find((t) => t.id === topicId), [topicId]);

  const [messages, setMessages] = useState(() => mockForumMessages[topicId ?? ''] ?? []);
  const [draft, setDraft] = useState('');
  const [sendPhase, setSendPhase] = useState<SendPhase>('idle');

  function handleSend() {
    const text = draft.trim();
    if (!text || sendPhase === 'sending') return;

    setSendPhase('sending');
    mockSend()
      .then(() => {
        setMessages((prev) => [...prev, { author: 'Você', time: 'agora', text }]);
        setDraft('');
        setSendPhase('idle');
      })
      .catch(() => setSendPhase('error'));
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FullSheetHeader title={topic?.title ?? 'Conversa'} onBack={() => router.back()} onClose={() => router.dismissAll()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
          {messages.map((m, i) => (
            <View key={i} style={styles.message}>
              <View style={styles.messageHead}>
                <Text style={styles.author}>{m.author}</Text>
                <Text style={styles.time}>{m.time}</Text>
              </View>
              <Text style={styles.text}>{m.text}</Text>
            </View>
          ))}
          {sendPhase === 'error' && <ErrorState message="A mensagem não foi enviada." onRetry={handleSend} />}
        </ScrollView>
        <View style={styles.footer}>
          <TextInput
            style={styles.input}
            placeholder="Escreva uma mensagem..."
            placeholderTextColor={colors.tx50}
            value={draft}
            onChangeText={setDraft}
            editable={sendPhase !== 'sending'}
          />
          <Pressable style={styles.sendBtn} onPress={handleSend} disabled={sendPhase === 'sending'}>
            <SendIcon size={14} color={colors.off} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.panelSolid,
  },
  body: {
    flex: 1,
    padding: 16,
  },
  message: {
    marginBottom: 16,
  },
  messageHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
    marginBottom: 3,
  },
  author: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 11.5,
  },
  time: {
    color: colors.tx30,
    fontFamily: fonts.mono,
    fontSize: 9.5,
  },
  text: {
    color: colors.tx70,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18.5,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,.05)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: 15,
    paddingVertical: 10,
    color: colors.off,
    fontFamily: fonts.body,
    fontSize: 12.5,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
