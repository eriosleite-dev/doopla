import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';
import { AGENDA_ENTRY_TYPES, AGENDA_ENTRY_TYPE_LABELS } from '@/lib/data/agenda';
import type { AgendaEntryType } from '@/types/agenda';

export function AddAgendaEntrySheet({
  initialDate,
  submitting,
  errorMessage,
  onSubmit,
}: {
  initialDate: string;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (params: { entryType: AgendaEntryType; startDate: string; endDate: string; note: string }) => void;
}) {
  const [entryType, setEntryType] = useState<AgendaEntryType>('indisponivel');
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [note, setNote] = useState('');

  return (
    <View>
      <Text style={styles.title}>Adicionar compromisso</Text>

      <Text style={styles.label}>Tipo</Text>
      <View style={styles.chips}>
        {AGENDA_ENTRY_TYPES.map((type) => {
          const active = type === entryType;
          return (
            <Pressable key={type} onPress={() => setEntryType(type)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{AGENDA_ENTRY_TYPE_LABELS[type]}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Data inicial (AAAA-MM-DD)</Text>
      <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2026-09-20" placeholderTextColor={colors.tx50} />

      <Text style={styles.label}>Data final (AAAA-MM-DD)</Text>
      <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2026-09-20" placeholderTextColor={colors.tx50} />

      <Text style={styles.label}>Nota (opcional)</Text>
      <TextInput
        style={[styles.input, styles.noteInput]}
        value={note}
        onChangeText={setNote}
        placeholder="Ex.: viagem pra São Paulo"
        placeholderTextColor={colors.tx50}
        multiline
      />

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <Pressable
        style={[styles.submit, submitting && styles.submitDisabled]}
        disabled={submitting}
        onPress={() => onSubmit({ entryType, startDate, endDate, note: note.trim() })}
      >
        <Text style={styles.submitText}>{submitting ? 'Salvando…' : 'Salvar'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 15,
    marginBottom: 14,
  },
  label: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 11,
    marginBottom: 6,
    marginTop: 12,
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
    paddingVertical: 7,
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
  noteInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  error: {
    color: '#ff8b80',
    fontFamily: fonts.body,
    fontSize: 11.5,
    marginTop: 12,
  },
  submit: {
    backgroundColor: colors.red,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 13,
  },
});
