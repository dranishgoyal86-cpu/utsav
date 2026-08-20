import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Platform, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { Upload } from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadToCloudinary } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { getParentCategory, getCategoryIcon } from '../../serviceTemplates';

const BUSINESS_TYPES = [
  'Individual / Freelancer',
  'Small business (2-10 people)',
  'Medium business (10-50 people)',
  'Large business (50+ people)',
];

const EXPERIENCE_OPTIONS = [
  'Less than 1 year',
  '1-3 years',
  '3-5 years',
  '5-10 years',
  '10+ years',
];

export default function VerificationScreen({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingRequest, setExistingRequest] = useState(null);
  const [providerId, setProviderId] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [providerCategory, setProviderCategory] = useState(null);
  const [form, setForm] = useState({
    businessName: '',
    businessType: '',
    yearsExperience: '',
    serviceAreas: '',
  });
  const [proofUrl, setProofUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function pickProof() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled) return;
    setUploading(true);
    try {
      const { url } = await uploadToCloudinary(result.assets[0].uri);
      setProofUrl(url);
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => { fetchStatus(); }, []);

  function showAlert(title, message) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  async function fetchStatus() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: provider } = await supabase
        .from('providers')
        .select('id, is_verified, category')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!provider) return;
      setProviderId(provider.id);
      setIsVerified(provider.is_verified);
      setProviderCategory(provider.category);

      // Business name now comes from Business Profile (provider_billing) —
      // no separate typed field here anymore, so it can't drift out of sync
      // with what's on invoices/shown to customers.
      const { data: billing } = await supabase
        .from('provider_billing').select('business_name').eq('provider_user_id', session.user.id).maybeSingle();
      if (billing?.business_name) updateForm('businessName', billing.business_name);

      const { data: request, error: reqError } = await supabase
        .from('verification_requests')
        .select('*')
        .eq('provider_id', provider.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reqError) console.log('Verification status fetch error:', reqError.message);
      setExistingRequest(request);
    } catch (err) {
      console.log(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateForm(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.businessName.trim()) {
      showAlert('Complete your Business Profile first', 'Your business name comes from your Business Profile — add it there, then come back here.');
      navigation.navigate('BillingProfile');
      return;
    }
    if (!form.businessType) {
      showAlert('Missing info', 'Please select your business type.');
      return;
    }
    if (!form.yearsExperience) {
      showAlert('Missing info', 'Please select your years of experience.');
      return;
    }
    if (!form.serviceAreas.trim()) {
      showAlert('Missing info', 'Please enter your service areas.');
      return;
    }
    if (!proofUrl) {
      showAlert('ID proof required', 'Please upload a government ID or business document — this is what makes the verified badge mean something.');
      return;
    }

    try {
      setSubmitting(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('verification_requests')
        .insert({
          provider_id: providerId,
          user_id: session.user.id,
          business_name: form.businessName.trim(),
          business_type: form.businessType,
          years_experience: form.yearsExperience,
          service_areas: form.serviceAreas.trim(),
          id_proof_url: proofUrl,
          status: 'pending',
        });

      if (error) throw error;

      showAlert(
        'Application submitted! 🎉',
        'Our team will review your application within 2-3 business days. You will be notified once verified.'
      );
      navigation.goBack();
    } catch (err) {
      console.log('Verification submit error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Get verified" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {isVerified ? (
          <View style={s.verifiedBox}>
            <Text style={s.verifiedIcon}>✓</Text>
            <Text style={s.verifiedTitle}>You're verified!</Text>
            <Text style={s.verifiedSub}>
              Your provider profile is verified and shown to customers with a verified badge.
            </Text>
          </View>
        ) : existingRequest ? (
          <View style={s.statusBox}>
            <View style={[s.statusBadge, {
              backgroundColor: existingRequest.status === 'pending'
                ? theme.statusPending
                : existingRequest.status === 'approved'
                ? theme.statusConfirmed
                : theme.statusDeclined
            }]}>
              <Text style={[s.statusText, {
                color: existingRequest.status === 'pending'
                  ? theme.statusPendingText
                  : existingRequest.status === 'approved'
                  ? theme.statusConfirmedText
                  : theme.statusDeclinedText
              }]}>
                {existingRequest.status === 'pending' ? '⏳ Under review'
                  : existingRequest.status === 'approved' ? '✓ Approved'
                  : '✗ Rejected'}
              </Text>
            </View>
            <Text style={s.statusTitle}>
              {existingRequest.status === 'pending'
                ? 'Application under review'
                : existingRequest.status === 'approved'
                ? 'Application approved!'
                : 'Application rejected'}
            </Text>
            <Text style={s.statusSub}>
              {existingRequest.status === 'pending'
                ? 'Our team is reviewing your application. This usually takes 2-3 business days.'
                : existingRequest.status === 'approved'
                ? 'Your profile has been verified. The verified badge is now visible on your profile.'
                : 'Your application was not approved. Please review the notes below and reapply.'}
            </Text>
            {existingRequest.admin_notes && (
              <View style={s.adminNotesBox}>
                <Text style={s.adminNotesTitle}>Admin notes</Text>
                <Text style={s.adminNotesText}>{existingRequest.admin_notes}</Text>
              </View>
            )}
            <View style={s.submittedInfo}>
              <Text style={s.submittedLabel}>Business name</Text>
              <Text style={s.submittedValue}>{existingRequest.business_name}</Text>
            </View>
            <View style={s.submittedInfo}>
              <Text style={s.submittedLabel}>Submitted on</Text>
              <Text style={s.submittedValue}>
                {new Date(existingRequest.submitted_at).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </Text>
            </View>
            {existingRequest.id_proof_url && (
              <View style={s.submittedInfo}>
                <Text style={s.submittedLabel}>ID proof</Text>
                <Text style={s.submittedValue}>Uploaded ✓</Text>
              </View>
            )}
            {existingRequest.status === 'rejected' && (
              <TouchableOpacity
                style={s.reapplyBtn}
                onPress={() => setExistingRequest(null)}
              >
                <Text style={s.reapplyBtnText}>Submit new application →</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={s.form}>
            {/* Category is fixed at claim time and confirmed here first —
                verification reviews the business behind an already-decided
                category, it doesn't let you pick a new one. */}
            {providerCategory && (
              <View style={s.categoryConfirmBox}>
                <Text style={s.categoryConfirmLabel}>Getting verified as</Text>
                <Text style={s.categoryConfirmValue}>
                  {getCategoryIcon(getParentCategory(providerCategory) || providerCategory)} {getParentCategory(providerCategory) || providerCategory}
                </Text>
                <Text style={s.categoryConfirmSub}>{providerCategory}</Text>
              </View>
            )}

            <View style={s.benefitsCard}>
              <Text style={s.benefitsTitle}>Why get verified?</Text>
              <View style={s.benefit}>
                <Text style={s.benefitIcon}>✓</Text>
                <Text style={s.benefitText}>Verified badge on your profile</Text>
              </View>
              <View style={s.benefit}>
                <Text style={s.benefitIcon}>✓</Text>
                <Text style={s.benefitText}>Higher ranking in search results</Text>
              </View>
              <View style={s.benefit}>
                <Text style={s.benefitIcon}>✓</Text>
                <Text style={s.benefitText}>3x more customer trust and bookings</Text>
              </View>
              <View style={s.benefit}>
                <Text style={s.benefitIcon}>✓</Text>
                <Text style={s.benefitText}>Eligible for featured listings</Text>
              </View>
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.label}>Business name <Text style={s.required}>*</Text></Text>
              {form.businessName ? (
                <View style={s.input}>
                  <Text style={{ fontSize: 15, color: theme.text }}>{form.businessName}</Text>
                </View>
              ) : (
                <TouchableOpacity style={s.businessNameMissing} onPress={() => navigation.navigate('BillingProfile')}>
                  <Text style={s.businessNameMissingText}>Not set yet — complete your Business Profile →</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.label}>Business type <Text style={s.required}>*</Text></Text>
              <View style={s.optionsWrap}>
                {BUSINESS_TYPES.map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[s.option, form.businessType === type && s.optionActive]}
                    onPress={() => updateForm('businessType', type)}
                  >
                    <Text style={[s.optionText, form.businessType === type && s.optionTextActive]}>
                      {form.businessType === type ? '● ' : '○ '}{type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.label}>Years of experience <Text style={s.required}>*</Text></Text>
              <View style={s.chipsWrap}>
                {EXPERIENCE_OPTIONS.map(exp => (
                  <TouchableOpacity
                    key={exp}
                    style={[s.chip, form.yearsExperience === exp && s.chipActive]}
                    onPress={() => updateForm('yearsExperience', exp)}
                  >
                    <Text style={[s.chipText, form.yearsExperience === exp && s.chipTextActive]}>
                      {exp}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.label}>Service areas <Text style={s.required}>*</Text></Text>
              <Text style={s.fieldHint}>
                Which cities or areas do you serve?
              </Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Delhi NCR, Gurugram, Noida, Faridabad"
                placeholderTextColor={theme.textTertiary}
                value={form.serviceAreas}
                onChangeText={v => updateForm('serviceAreas', v)}
              />
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.label}>ID or business proof <Text style={s.required}>*</Text></Text>
              <Text style={s.fieldHint}>
                A government ID, GST certificate, or shop license — this is what an admin actually checks before your verified badge goes live.
              </Text>
              <TouchableOpacity style={s.uploadBtn} onPress={pickProof} disabled={uploading}>
                {uploading ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : (
                  <>
                    <Upload size={18} color={proofUrl ? '#4CAF50' : theme.accent} />
                    <Text style={[s.uploadBtnText, proofUrl && { color: '#4CAF50' }]}>
                      {proofUrl ? 'Document uploaded ✓' : 'Upload ID / business proof'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={s.infoBox}>
              <Text style={s.infoText}>
                ℹ️ Our team will review your application and document within 2-3 business days. You'll be notified once verified.
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {!isVerified && !existingRequest && (
        <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
          <TouchableOpacity
            style={[s.submitBtn, submitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color={theme.btnPrimaryText} />
              : <Text style={s.submitBtnText}>Submit verification application →</Text>
            }
          </TouchableOpacity>
        </View>
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    verifiedBox: { alignItems: 'center', padding: 40 },
    verifiedIcon: { fontSize: 60, color: theme.statusConfirmedText, marginBottom: 18 },
    verifiedTitle: { fontSize: 23, fontWeight: '700', color: theme.statusConfirmedText, marginBottom: 9 },
    verifiedSub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 22 },

    statusBox: { margin: 16, padding: 22, backgroundColor: theme.cardBg, borderRadius: 22, borderWidth: 0.5, borderColor: theme.border },
    statusBadge: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 14 },
    statusText: { fontSize: 13, fontWeight: '700' },
    statusTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 9 },
    statusSub: { fontSize: 13, color: theme.textSecondary, lineHeight: 20, marginBottom: 18 },
    adminNotesBox: { backgroundColor: theme.statusDeclined, borderRadius: 14, padding: 13, marginBottom: 18 },
    adminNotesTitle: { fontSize: 12, fontWeight: '700', color: theme.statusDeclinedText, marginBottom: 5 },
    adminNotesText: { fontSize: 13, color: theme.statusDeclinedText, lineHeight: 18 },
    submittedInfo: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 0.5, borderTopColor: theme.border },
    submittedLabel: { fontSize: 13, color: theme.textSecondary },
    submittedValue: { fontSize: 13, fontWeight: '600', color: theme.text },
    reapplyBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
    reapplyBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    form: { padding: 16 },
    categoryConfirmBox: {
      backgroundColor: theme.cardBg, borderRadius: 18, padding: 17, marginBottom: 18,
      borderWidth: 1, borderColor: theme.border,
    },
    categoryConfirmLabel: { fontSize: 11.5, color: theme.textSecondary, marginBottom: 4 },
    categoryConfirmValue: { fontSize: 17, fontWeight: '700', color: theme.text },
    categoryConfirmSub: { fontSize: 12.5, color: theme.textSecondary, marginTop: 3 },
    businessNameMissing: {
      backgroundColor: theme.statusPending, borderRadius: 14,
      paddingHorizontal: 15, paddingVertical: 13, borderWidth: 1, borderColor: theme.accent,
    },
    businessNameMissingText: { fontSize: 13.5, fontWeight: '700', color: theme.accent },
    benefitsCard: { backgroundColor: theme.statusConfirmed, borderRadius: 18, padding: 17, marginBottom: 26 },
    benefitsTitle: { fontSize: 14, fontWeight: '700', color: theme.statusConfirmedText, marginBottom: 11 },
    benefit: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
    benefitIcon: { fontSize: 12, color: theme.statusConfirmedText, fontWeight: '700' },
    benefitText: { fontSize: 13, color: theme.statusConfirmedText },

    fieldGroup: { marginBottom: 22 },
    label: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 5 },
    required: { color: theme.accent },
    fieldHint: { fontSize: 12, color: theme.textSecondary, marginBottom: 9 },
    input: { backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, fontSize: 14, borderWidth: 0.5, borderColor: theme.border, color: theme.text },

    optionsWrap: { gap: 8 },
    option: { flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg },
    optionActive: { backgroundColor: theme.text, borderColor: theme.text },
    optionText: { fontSize: 13, color: theme.textSecondary },
    optionTextActive: { color: theme.bg, fontWeight: '600' },

    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg },
    chipActive: { backgroundColor: theme.text, borderColor: theme.text },
    chipText: { fontSize: 13, color: theme.textSecondary },
    chipTextActive: { color: theme.bg, fontWeight: '600' },

    uploadBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderRadius: 12, paddingVertical: 14,
      borderWidth: 1, borderColor: theme.accent, borderStyle: 'dashed',
    },
    uploadBtnText: { fontSize: 14, fontWeight: '600', color: theme.accent },
    infoBox: { backgroundColor: theme.cardBg, borderRadius: 14, padding: 15, borderWidth: 0.5, borderColor: theme.border },
    infoText: { fontSize: 12, color: theme.textSecondary, lineHeight: 18 },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    submitBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    submitBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },
  });
}