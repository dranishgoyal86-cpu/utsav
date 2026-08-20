import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { ArrowLeft, SealCheck, Upload, MagnifyingGlass } from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadProviderDocument, showAlert } from '../../helpers';
import RequestCategoryModal from '../../components/RequestCategoryModal';
import { CATEGORY_NAMES, getSubcategories, getParentCategory, getCategoryIcon, guessSubcategory } from '../../serviceTemplates';
import AppHeader from '../../components/AppHeader';

const DOCUMENT_TYPES = [
  { key: 'business_image', label: 'Business image' },
  { key: 'gst_certificate', label: 'GST certificate' },
  { key: 'visiting_card', label: 'Visiting card' },
  { key: 'letterhead', label: 'Letterhead' },
  { key: 'other_govt_id', label: 'Other govt. ID' },
];

// provider.category might be an OLD-style subcategory value (real seeded
// listings predating the parent-category migration), a NEW-style parent
// value, or an unrecognized legacy string. Try subcategory lookup first
// (old-style), then treat it as an already-parent value, else give up and
// let the claimant pick from scratch.
function guessedSubcategory(oldCategory) {
  if (!oldCategory) return '';
  if (getParentCategory(oldCategory)) return oldCategory;
  return guessSubcategory(oldCategory) || '';
}

function guessedParent(oldCategory) {
  const sub = guessedSubcategory(oldCategory);
  if (sub) return getParentCategory(sub);
  return CATEGORY_NAMES.includes(oldCategory) ? oldCategory : '';
}

export default function ClaimBusiness({ route, navigation }) {
  const { provider } = route.params;
  const { theme } = useTheme();
  const s = styles(theme);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [majorHeadGroup, setMajorHeadGroup] = useState(guessedParent(provider.category));
  const [selectedSubcategories, setSelectedSubcategories] = useState(
    guessedSubcategory(provider.category) ? [guessedSubcategory(provider.category)] : []
  );
  const [categoryQuery, setCategoryQuery] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [proofUrl, setProofUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [requestCategoryModal, setRequestCategoryModal] = useState(false);

  const categoryResults = categoryQuery.trim()
    ? CATEGORY_NAMES.filter(c => c.toLowerCase().includes(categoryQuery.trim().toLowerCase()))
    : [];

  function selectCategory(cat) {
    setMajorHeadGroup(cat);
    setSelectedSubcategories([]);
    setCategoryQuery('');
  }

  function toggleSubcategory(sub) {
    setSelectedSubcategories(prev => prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]);
  }

  // Every path into this screen (search results, or ProviderProfile.js's
  // "Claim now" banner on a specific listing) is claiming a PRE-EXISTING
  // listing by definition — so proof is mandatory here, unlike
  // ClaimVendorFlow's lighter optional-photo treatment for genuinely new
  // registrations.
  async function pickProof() {
    if (!documentType) {
      showAlert('Pick a document type', "Choose which type of document you're uploading first.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const path = await uploadProviderDocument(result.assets[0].uri, user.id, documentType);
      setProofUrl(path);
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  }

  async function submitClaim() {
    if (!name.trim() || !phone.trim()) {
      showAlert('Required', 'Please enter your name and phone number.');
      return;
    }
    if (phone.trim().replace(/\D/g, '').length < 10) {
      showAlert('Invalid phone', 'Please enter a valid 10-digit phone number.');
      return;
    }
    if (!majorHeadGroup) {
      showAlert('Select your category', 'Choose the category that best describes your business.');
      return;
    }
    if (selectedSubcategories.length === 0) {
      showAlert('Select your services', 'Choose at least one service you offer.');
      return;
    }
    if (!proofUrl) {
      showAlert('Proof required', 'Claiming an existing listing needs at least one proof document — this helps us prevent fraudulent claims.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showAlert('Login required', 'Please log in to claim a business.');
        return;
      }

      const { error } = await supabase.from('provider_claims').insert({
        provider_id: provider.id,
        claimant_user_id: user.id,
        claimant_name: name.trim(),
        claimant_phone: phone.trim(),
        business_proof_url: proofUrl,
        document_type: documentType,
        message: message.trim(),
        claimed_category: majorHeadGroup,
        claimed_subcategories: selectedSubcategories,
      });

      if (error) {
        if (error.code === '23505') {
          showAlert('Already submitted', 'You have already submitted a claim for this business.');
        } else {
          throw error;
        }
        return;
      }

      // Harmless no-op for every other entry point into this screen — only
      // set when the claim came from ClaimVendorFlow.js's registration flow.
      await supabase.from('users').update({ pending_claim_category: null }).eq('id', user.id);

      setSubmitted(true);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <SafeAreaView style={[s.container, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        <SealCheck size={64} color="#4CAF50" />
        <Text style={s.successTitle}>Claim Submitted!</Text>
        <Text style={s.successText}>
          Our team will review your claim for "{provider.name}" and get back to you within 1-2 business days.
        </Text>
        <TouchableOpacity style={s.doneBtn} onPress={() => navigation.goBack()}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader title="Claim Business" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={s.businessCard}>
          <Text style={s.businessName}>{provider.name}</Text>
          {provider.category ? <Text style={s.businessMeta}>{provider.category}</Text> : null}
          {provider.city ? <Text style={s.businessMeta}>📍 {provider.city}</Text> : null}
        </View>

        <Text style={s.info}>
          Claim this listing to manage your profile, receive bookings, and chat with customers on Utsav.
        </Text>

        {/* Category first — it decides everything downstream (which
            services you offer), so it's the first thing asked here too,
            before name/phone. */}
        <View>
          <Text style={s.majorHeadLabel}>Your Category *</Text>
          {majorHeadGroup ? (
            <View style={s.lockedCategoryRow}>
              <Text style={s.lockedCategoryText}>{getCategoryIcon(majorHeadGroup)} {majorHeadGroup}</Text>
              <TouchableOpacity onPress={() => { setMajorHeadGroup(''); setSelectedSubcategories([]); }}>
                <Text style={s.requestCategoryLink}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={s.searchBox}>
                <MagnifyingGlass size={18} color={theme.textSecondary} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search categories..."
                  placeholderTextColor={theme.textSecondary || theme.subtext}
                  value={categoryQuery}
                  onChangeText={setCategoryQuery}
                />
              </View>
              {categoryResults.map(cat => (
                <TouchableOpacity key={cat} style={s.categoryRow} onPress={() => selectCategory(cat)}>
                  <Text style={{ fontSize: 18 }}>{getCategoryIcon(cat)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowName}>{cat}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setRequestCategoryModal(true)}>
                <Text style={s.requestCategoryLink}>Don't see your category? Request one →</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {majorHeadGroup ? (
          <View>
            <Text style={s.majorHeadLabel}>Which services do you offer? *</Text>
            <Text style={s.majorHeadHint}>Select your services</Text>
            <View style={s.chipsWrap}>
              {getSubcategories(majorHeadGroup).map(sub => (
                <TouchableOpacity
                  key={sub}
                  style={[s.chip, selectedSubcategories.includes(sub) && s.chipActive]}
                  onPress={() => toggleSubcategory(sub)}
                >
                  <Text style={[s.chipText, selectedSubcategories.includes(sub) && s.chipTextActive]}>
                    {selectedSubcategories.includes(sub) ? '✓ ' : ''}{sub}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        <TextInput
          style={s.input}
          placeholder="Your full name *"
          placeholderTextColor={theme.textSecondary || theme.subtext}
          value={name}
          onChangeText={setName}
        />

        <TextInput
          style={s.input}
          placeholder="Business phone number *"
          placeholderTextColor={theme.textSecondary || theme.subtext}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Text style={s.majorHeadLabel}>Proof of ownership *</Text>
        <Text style={s.majorHeadHint}>
          Claiming an existing listing needs at least one proof document — this helps us prevent fraudulent duplicate claims.
        </Text>
        <View style={s.chipsWrap}>
          {DOCUMENT_TYPES.map(dt => (
            <TouchableOpacity
              key={dt.key}
              style={[s.chip, documentType === dt.key && s.chipActive]}
              onPress={() => { setDocumentType(dt.key === documentType ? '' : dt.key); setProofUrl(null); }}
            >
              <Text style={[s.chipText, documentType === dt.key && s.chipTextActive]}>{dt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={s.uploadBtn} onPress={pickProof} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <>
              <Upload size={18} color={proofUrl ? '#4CAF50' : theme.accent} />
              <Text style={[s.uploadBtnText, proofUrl && { color: '#4CAF50' }]}>
                {proofUrl ? 'Document uploaded ✓' : 'Upload document'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TextInput
          style={[s.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]}
          placeholder="Anything else we should know? (optional)"
          placeholderTextColor={theme.textSecondary || theme.subtext}
          value={message}
          onChangeText={setMessage}
          multiline
        />

        <TouchableOpacity style={s.submitBtn} onPress={submitClaim} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator size="small" color={theme.bg} />
          ) : (
            <Text style={s.submitBtnText}>Submit Claim</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    <RequestCategoryModal visible={requestCategoryModal} onClose={() => setRequestCategoryModal(false)} />
    </SafeAreaView>
  );
}

const styles = theme => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  backBtn: { padding: 4 },
  businessCard: {
    backgroundColor: theme.cardBg || theme.card, borderRadius: 16, padding: 16,
    borderWidth: 0.5, borderColor: theme.border, gap: 4,
  },
  businessName: { fontSize: 17, fontWeight: '700', color: theme.text },
  businessMeta: { fontSize: 13, color: theme.textSecondary || theme.subtext },
  info: { fontSize: 13, color: theme.textSecondary || theme.subtext, lineHeight: 20 },
  input: {
    backgroundColor: theme.bgSecondary || theme.inputBg, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: theme.text,
    borderWidth: 0.5, borderColor: theme.border,
  },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: theme.accent, borderStyle: 'dashed',
  },
  uploadBtnText: { fontSize: 14, fontWeight: '600', color: theme.accent },
  lockedCategoryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.bgSecondary || theme.inputBg, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13, borderWidth: 0.5, borderColor: theme.border,
  },
  lockedCategoryText: { fontSize: 14, fontWeight: '700', color: theme.text },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 4,
    backgroundColor: theme.bgSecondary || theme.inputBg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.text },
  categoryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8,
    backgroundColor: theme.bgSecondary || theme.inputBg, borderRadius: 12, padding: 12,
    borderWidth: 0.5, borderColor: theme.border,
  },
  rowName: { fontSize: 14, fontWeight: '700', color: theme.text },
  rowMeta: { fontSize: 12, color: theme.textSecondary || theme.subtext, marginTop: 1 },
  majorHeadLabel: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 5 },
  majorHeadHint: { fontSize: 12, color: theme.textSecondary || theme.subtext, lineHeight: 18, marginBottom: 11 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  requestCategoryLink: { fontSize: 13, color: theme.accent, fontWeight: '600', marginTop: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18,
    borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.bgSecondary || theme.inputBg,
  },
  chipActive: { backgroundColor: theme.text, borderColor: theme.text },
  chipText: { fontSize: 13, color: theme.textSecondary || theme.subtext },
  chipTextActive: { color: theme.bg, fontWeight: '600' },
  submitBtn: {
    backgroundColor: theme.accent, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
  successTitle: { fontSize: 22, fontWeight: '800', color: theme.text, marginTop: 16, marginBottom: 8 },
  successText: { fontSize: 14, color: theme.textSecondary || theme.subtext, textAlign: 'center', lineHeight: 22 },
  doneBtn: {
    backgroundColor: theme.accent, borderRadius: 12,
    paddingHorizontal: 32, paddingVertical: 14, marginTop: 24,
  },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
});