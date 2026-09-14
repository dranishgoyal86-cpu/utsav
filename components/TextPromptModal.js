import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../ThemeContext';

// Small reusable "confirm with a bit of free text" modal — built for the
// guest-change-notification prompt and the event-cancellation reason (both
// need real typed text, which Alert can't collect on Android/web, only
// iOS's Alert.prompt). Generic on purpose (title/message/placeholder/
// required/confirmLabel) rather than two bespoke modals, since the shape
// is identical — only whether the text is required (a cancellation reason)
// or optional (a change-notification note) differs.
export default function TextPromptModal({
  visible, title, message, placeholder, defaultValue = '', required = false,
  confirmLabel = 'Send', cancelLabel = 'Cancel', onConfirm, onCancel,
}) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [text, setText] = useState(defaultValue);

  useEffect(() => { if (visible) setText(defaultValue); }, [visible, defaultValue]);

  const canConfirm = !required || text.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title}>{title}</Text>
          {message ? <Text style={s.message}>{message}</Text> : null}
          <TextInput
            style={s.input}
            placeholder={placeholder}
            placeholderTextColor={theme.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={3}
            autoFocus
          />
          <View style={s.row}>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
              <Text style={s.cancelBtnText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.confirmBtn, !canConfirm && { opacity: 0.5 }]}
              onPress={() => canConfirm && onConfirm(text.trim())}
              disabled={!canConfirm}
            >
              <Text style={s.confirmBtnText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 420, backgroundColor: theme.cardBg, borderRadius: 20, padding: 22, borderWidth: 0.5, borderColor: theme.border },
    title: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 6 },
    message: { fontSize: 13, color: theme.textSecondary, marginBottom: 14, lineHeight: 19 },
    input: {
      backgroundColor: theme.bg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, color: theme.text, borderWidth: 1, borderColor: theme.border,
      minHeight: 80, textAlignVertical: 'top',
    },
    row: { flexDirection: 'row', gap: 10, marginTop: 18 },
    cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: theme.border },
    cancelBtnText: { fontSize: 14, fontWeight: '700', color: theme.textSecondary },
    confirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: theme.btnPrimary },
    confirmBtnText: { fontSize: 14, fontWeight: '700', color: theme.btnPrimaryText },
  });
}
