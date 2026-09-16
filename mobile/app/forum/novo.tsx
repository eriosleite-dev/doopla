import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { FullSheetHeader } from '@/components/shared/FullSheetHeader';
import { ErrorState, LoadingState } from '@/components/shared/ScreenState';
import { createCommunityTopic, fetchCommunityTags } from '@/lib/data/community';
import type { CommunityTag } from '@/types/community';

type Phase = 'loading' | 'ready' | 'error';

// Comunidade — Fase 1 (06/09/2026). Tela que não existia no mock —
// criar tópico é parte do loop central pedido (buscar → abrir →
// responder → criar → salvar). Mesma RPC/validação que o painel web
// (create_community_topic, migration 0059).
//
// Busca universal (16/09/2026) — categoria removida deste formulário
// (decisão canônica: Comunidade nunca exige taxonomia fechada pra
// publicar). Mesmo comportamento da Web (ProComunidadeNovoForm).
export default function ForumNovoTopicoScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [tags, setTags] = useState<CommunityTag[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCommunityTags()
      .then((tgs) => {
        setTags(tgs);
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, []);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  async function handlePublish() {
    if (title.trim().length < 3) return setError('O título precisa ter pelo menos 3 caracteres.');
    if (!body.trim()) return setError('Escreva o que você quer perguntar ou discutir.');

    setError(null);
    setSubmitting(true);
    try {
      const topicId = await createCommunityTopic({ title: title.trim(), body: body.trim(), categoryId: null, tagIds: selectedTagIds });
      router.replace(`/forum/${topicId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o tópico.');
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FullSheetHeader title="Criar tópico" onBack={() => router.back()} onClose={() => router.dismissAll()} />
      {phase === 'loading' && <LoadingState label="Carregando…" />}
      {phase === 'error' && <ErrorState message="Não deu pra carregar as categorias agora." />}
      {phase === 'ready' && (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 32 }}>
          <Text style={styles.label}>Título</Text>
          <TextInput style={styles.input} placeholder="O que você quer conversar?" placeholderTextColor={colors.tx50} value={title} onChangeText={setTitle} />

          <Text style={styles.label}>Descrição</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Conte um pouco mais."
            placeholderTextColor={colors.tx50}
            value={body}
            onChangeText={setBody}
            multiline
          />

          {tags.length > 0 && (
            <>
              <Text style={styles.label}>Tags (opcional, até 5)</Text>
              <View style={styles.chips}>
                {tags.map((tag) => {
                  const active = selectedTagIds.includes(tag.id);
                  return (
                    <Pressable key={tag.id} onPress={() => toggleTag(tag.id)} style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{tag.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={[styles.publishBtn, submitting && styles.publishBtnDisabled]} onPress={handlePublish} disabled={submitting}>
            <Text style={styles.publishText}>{submitting ? 'Publicando…' : 'Publicar tópico'}</Text>
          </Pressable>
        </ScrollView>
      )}
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
  label: {
    color: colors.tx50,
    fontFamily: fonts.subSemiBold,
    fontSize: 11.5,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,.05)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.off,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  textarea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  chipText: {
    color: colors.tx70,
    fontFamily: fonts.subSemiBold,
    fontSize: 11,
  },
  chipTextActive: {
    color: colors.off,
  },
  error: {
    color: '#ff8b80',
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 14,
  },
  publishBtn: {
    marginTop: 22,
    backgroundColor: colors.red,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  publishBtnDisabled: {
    opacity: 0.6,
  },
  publishText: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 13,
  },
});
