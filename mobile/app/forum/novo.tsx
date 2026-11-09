import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { FullSheetHeader } from '@/components/shared/FullSheetHeader';
import { createCommunityTopic } from '@/lib/data/community';

const MAX_TAGS = 5;

function normalizeTagForCompare(tag: string): string {
  return tag.trim().toLowerCase();
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const message = (err as { message: string }).message.trim();
    if (message) return message;
  }
  return fallback;
}

// Comunidade — Fase 1 (06/09/2026). Tela que não existia no mock —
// criar tópico é parte do loop central pedido (buscar → abrir →
// responder → criar → salvar). Mesma RPC/validação que o painel web
// (create_community_topic, migration 0059).
//
// Busca universal (16/09/2026) — categoria removida deste formulário
// (decisão canônica: Comunidade nunca exige taxonomia fechada pra
// publicar). Mesmo comportamento da Web (ProComunidadeNovoForm).
//
// Tags livres (16/09/2026, QA real) — mesma correção da Web: a lista
// fixa de tags (fetchCommunityTags, chips pré-definidos) era a MESMA
// taxonomia fechada disfarçada que a busca universal já tinha corrigido
// pra categoria. Trocado por input de texto livre + Enter, até 5,
// removível — nunca um catálogo/dropdown. Isso também elimina a
// espera de rede antes de mostrar o formulário (não existe mais
// `phase: 'loading'` — nada bloqueia o primeiro render).
export default function ForumNovoTopicoScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addTag() {
    const value = tagInput.trim();
    if (!value) {
      setTagError(null);
      return;
    }
    if (value.length < 2 || value.length > 40) {
      setTagError('A tag precisa ter entre 2 e 40 caracteres.');
      return;
    }
    if (tags.length >= MAX_TAGS) {
      setTagError(`Máximo de ${MAX_TAGS} tags.`);
      return;
    }
    if (tags.some((t) => normalizeTagForCompare(t) === normalizeTagForCompare(value))) {
      setTagInput('');
      setTagError(null);
      return;
    }
    setTags((prev) => [...prev, value]);
    setTagInput('');
    setTagError(null);
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handlePublish() {
    if (title.trim().length < 3) return setError('O título precisa ter pelo menos 3 caracteres.');
    if (!body.trim()) return setError('Escreva o que você quer perguntar ou discutir.');

    setError(null);
    setSubmitting(true);
    try {
      const topicId = await createCommunityTopic({ title: title.trim(), body: body.trim(), categoryId: null, tagLabels: tags });
      router.replace(`/forum/${topicId}`);
    } catch (err) {
      console.error('ForumNovoTopicoScreen: create_community_topic falhou', err);
      setError(extractErrorMessage(err, 'Não foi possível criar o tópico. Tente de novo em instantes.'));
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FullSheetHeader title="Criar tópico" onBack={() => router.back()} onClose={() => router.dismissAll()} />
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

        <Text style={styles.label}>Tags (opcional, até {MAX_TAGS})</Text>
        {tags.length > 0 && (
          <View style={styles.chips}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagChipText}>{tag}</Text>
                <Pressable onPress={() => removeTag(tag)} hitSlop={8}>
                  <Text style={styles.tagChipRemove}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
        {tags.length < MAX_TAGS && (
          <TextInput
            style={styles.input}
            placeholder="Adicione uma tag..."
            placeholderTextColor={colors.tx50}
            value={tagInput}
            onChangeText={(text) => {
              setTagInput(text);
              if (tagError) setTagError(null);
            }}
            onSubmitEditing={addTag}
            onBlur={addTag}
            maxLength={40}
            returnKeyType="done"
          />
        )}
        {tagError && <Text style={styles.error}>{tagError}</Text>}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.publishBtn, submitting && styles.publishBtnDisabled]} onPress={handlePublish} disabled={submitting}>
          <Text style={styles.publishText}>{submitting ? 'Publicando…' : 'Publicar tópico'}</Text>
        </Pressable>
      </ScrollView>
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
    marginBottom: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,.05)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  tagChipText: {
    color: colors.tx70,
    fontFamily: fonts.subSemiBold,
    fontSize: 11,
  },
  tagChipRemove: {
    color: colors.tx50,
    fontSize: 13,
    lineHeight: 13,
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
