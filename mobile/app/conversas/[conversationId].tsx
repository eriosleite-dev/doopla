import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { FullSheetHeader } from '@/components/shared/FullSheetHeader';
import { LoadingState, ErrorState } from '@/components/shared/ScreenState';
import { SendIcon } from '@/components/icons/Icons';
import { formatRelativeDate } from '@/lib/format';
import { comparePreparedResponseText } from '@/lib/prepared-response';
import { CONVERSATION_STATE_LABELS, conversationStateColor } from '@/lib/conversation-labels';
import {
  fetchConversationMessages,
  fetchConversationOperationalFacts,
  fetchExternalParticipant,
  fetchPendingDraft,
  sendProfessionalReply,
} from '@/lib/data/conversations';
import type { ConversationMessage, ConversationOperationalFacts, ExternalParticipant, PendingDraft } from '@/types/conversation';

type Phase = 'loading' | 'ready' | 'error';

export default function ConversaDetailScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>('loading');
  const [facts, setFacts] = useState<ConversationOperationalFacts | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState<PendingDraft | null>(null);
  const [externalParticipant, setExternalParticipant] = useState<ExternalParticipant | null>(null);

  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    if (!conversationId) return;
    setPhase('loading');
    Promise.all([fetchConversationOperationalFacts(conversationId), fetchConversationMessages(conversationId), fetchPendingDraft(conversationId)])
      .then(async ([factsData, messagesData, draftData]) => {
        setFacts(factsData);
        setMessages(messagesData);
        setDraft(draftData);
        setBody(draftData?.content ?? '');
        if (factsData?.externalParticipantId) {
          const participant = await fetchExternalParticipant(factsData.externalParticipantId).catch(() => null);
          setExternalParticipant(participant);
        } else {
          setExternalParticipant(null);
        }
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSend() {
    if (!conversationId || !body.trim() || sending || !session?.access_token) return;
    setSending(true);
    try {
      const result = await sendProfessionalReply({
        conversationId,
        submissionId: `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        body,
        outboundIntentId: draft?.id ?? null,
        accessToken: session.access_token,
      });
      if (result.kind === 'action_error' || result.kind === 'conversation_busy' || result.kind === 'author_mismatch' || result.kind === 'failed') {
        toast.show(typeof result.error === 'string' ? result.error : 'Não foi possível enviar sua resposta agora.');
      } else {
        setBody('');
        load();
      }
    } catch {
      toast.show('Não foi possível enviar sua resposta agora.');
    } finally {
      setSending(false);
    }
  }

  const title = facts?.conversationType === 'professional_self' ? 'Você e a Doopla' : (externalParticipant?.name ?? 'Cliente');
  const conversationClosed = facts?.status === 'closed' || facts?.status === 'archived';
  const editedPreview = draft && body.trim() ? comparePreparedResponseText(draft.content, body) === 'edited' : false;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FullSheetHeader title={phase === 'ready' ? title : 'Conversa'} onBack={() => router.back()} onClose={() => router.dismissAll()} />

      {phase === 'loading' && <LoadingState label="Carregando conversa…" />}
      {phase === 'error' && <ErrorState message="Não conseguimos carregar essa conversa agora." onRetry={load} />}
      {phase === 'ready' && !facts && <ErrorState message="Essa conversa não existe ou você não tem acesso a ela." />}

      {phase === 'ready' && facts && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: conversationStateColor(facts.state) }]} />
            <Text style={[styles.statusText, { color: conversationStateColor(facts.state) }]}>{CONVERSATION_STATE_LABELS[facts.state]}</Text>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
            {messages.length === 0 && <Text style={styles.emptyText}>Nenhuma mensagem ainda.</Text>}
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </ScrollView>

          {conversationClosed ? (
            <Text style={styles.closedNote}>Esta conversa foi encerrada.</Text>
          ) : (
            <View style={styles.footer}>
              {draft && (
                <Text style={styles.draftNote}>
                  {editedPreview ? 'Você está editando o rascunho da Doopla antes de enviar.' : 'Rascunho preparado pela Doopla — revise antes de enviar.'}
                </Text>
              )}
              <View style={styles.footerRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Escreva sua resposta…"
                  placeholderTextColor={colors.tx50}
                  value={body}
                  onChangeText={setBody}
                  editable={!sending}
                  multiline
                />
                <Pressable style={styles.sendBtn} onPress={handleSend} disabled={sending || !body.trim()}>
                  <SendIcon size={14} color={colors.off} />
                </Pressable>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

// "Você respondeu"/"Você editou o rascunho antes de enviar" — fato de
// MENSAGEM individual (prepared_response_outcome, migration 0066),
// nunca estado de conversa. Espelha MessageBubble do painel web
// (conversa-view.tsx).
function MessageBubble({ message }: { message: ConversationMessage }) {
  const isFromProfessional = message.authorType === 'professional';
  const isFromClient = message.authorType === 'external_participant';
  const label = isFromClient ? 'Cliente' : isFromProfessional ? 'Você' : 'Doopla';

  return (
    <View style={[styles.message, isFromProfessional && styles.messageMine]}>
      <View style={styles.messageHead}>
        <Text style={styles.author}>{label}</Text>
        <Text style={styles.time}>{formatRelativeDate(message.createdAt)}</Text>
      </View>
      <Text style={styles.text}>
        {message.contentType === 'text' ? (message.body ?? '') : (message.transcript ?? `[${message.contentType}]`)}
      </Text>
      {message.preparedResponseOutcome === 'sent' && <Text style={styles.provenance}>Você respondeu</Text>}
      {message.preparedResponseOutcome === 'edited' && <Text style={styles.provenance}>Você editou o rascunho antes de enviar</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.panelSolid,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  body: {
    flex: 1,
    padding: 16,
  },
  emptyText: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 24,
  },
  message: {
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  messageMine: {
    alignItems: 'flex-end',
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
  provenance: {
    color: colors.tx30,
    fontFamily: fonts.mono,
    fontSize: 9,
    marginTop: 2,
  },
  closedNote: {
    color: colors.tx30,
    fontFamily: fonts.body,
    fontSize: 11.5,
    textAlign: 'center',
    paddingVertical: 16,
  },
  draftNote: {
    color: colors.tx50,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,.05)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    paddingHorizontal: 15,
    paddingVertical: 10,
    color: colors.off,
    fontFamily: fonts.body,
    fontSize: 12.5,
    maxHeight: 120,
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
