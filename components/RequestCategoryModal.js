import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { X } from 'phosphor-react-native';
import { supabase } from '../supabase';
import { useTheme } from '../ThemeContext';
import { showAlert } from '../helpers';

// Shared across every "pick your category" screen (pre-login claim signup,
// claim-a-listing, add-a-service) so a vendor who can't find their business
// type anywhere in the 30-entry taxonomy has one consistent way to ask for
// it, instead of three different one-off forms. requested_by is nullable —
// ClaimVendorFlow reaches this before the vendor has an account yet, so
// there's no session to attach; requester_contact covers follow-up either way.
export default function RequestCategoryModal({ visible, onClose }) {
  const { theme } = useTheme();
  const s = styles(theme);
  const [categoryName, setCategoryName] = useState('');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!categoryName.trim()) {
      showAlert('Category name needed', "Tell us what category you'd like added.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.from('category_requests').insert({
        requested_by: session?.user?.id || null,
        requester_contact: contact.trim() || session?.user?.email || null,
        category_name: categoryName.trim(),
        description: description.trim() || null,
      });
      if (error) throw error;
      showAlert('Request sent', "Thanks — we'll review this and let you know.");
      setCategoryName('');
      setDescription('');
      setContact('');
      onClose();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.modal}>
          <View style={s.header}>
            <Text style={s.title}>Request a category</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={theme.text} />
            </TouchableOpacity>
          </View>
          <Text style={s.hint}>
            Don't see your business type in the list? Tell us about it and we'll review adding it.
          </Text>

          <Text style={s.label}>Category name *</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Drone Light Shows"
            placeholderTextColor={theme.textTertiary}
            value={categoryName}
            onChangeText={setCategoryName}
          />

          <Text style={s.label}>Description</Text>
          <TextInput
            style={[s.input, s.textArea]}
            placeholder="What kind of services would fall under this?"
            placeholderTextColor={theme.textTertiary}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Text style={s.label}>Your contact (email or phone, optional)</Text>
          <TextInput
            style={s.input}
            placeholder="So we can follow up"
            placeholderTextColor={theme.textTertiary}
            value={contact}
            onChangeText={setContact}
          />

          <TouchableOpacity
            style={[s.submitBtn, submitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#FFF" />
              : <Text style={s.submitBtnText}>Send request</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = theme => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: theme.bg, borderRadius: 20, padding: 20, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '700', color: theme.text },
  hint: { fontSize: 12.5, color: theme.textSecondary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: theme.text, backgroundColor: theme.cardBg,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
