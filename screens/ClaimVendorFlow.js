import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, SealCheck, Upload, MagnifyingGlass } from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import { useTheme } from '../ThemeContext';
import SparkleIcon from '../components/SparkleIcon';
import RequestCategoryModal from '../components/RequestCategoryModal';
import { CATEGORY_NAMES, getSubcategories, getCategoryIcon } from '../serviceTemplates';
import { showAlert, uploadToCloudinary, uploadProviderDocument, getSignedDocumentUrl } from '../helpers';

const DOCUMENT_TYPES = [
  { key: 'business_image', label: 'Business image' },
  { key: 'gst_certificate', label: 'GST certificate' },
  { key: 'visiting_card', label: 'Visiting card' },
  { key: 'letterhead', label: 'Letterhead' },
  { key: 'other_govt_id', label: 'Other govt. ID' },
];

// Single-file wizard replacing the old ClaimVendorSignup -> ClaimSelectBusiness
// pipeline. Registered under the SAME route name in every branch of App.js's
// Stack.Navigator (mirroring RSVPScreen's existing cross-auth-state pattern)
// because mobile-OTP verification produces a real session mid-flow — if this
// screen weren't present in both the logged-out and customer screen sets at
// that exact moment, React Navigation would drop it and reset, silently
// losing everything typed so far. Keeping one component mounted across that
// transition makes the session change invisible to it.
// Phone/email OTP verification is on hold — no SMS provider is configured
// yet (see CLAUDE.md blockers), so gating signup on a code that can never
// arrive would block every claim. The OTP code below stays intact and
// reachable; flip this back to true once real SMS/email OTP delivery works.
// Exported so other OTP-gated signup flows (e.g. GuestSignup.js) gate on
// this exact same flag rather than each defining their own copy — one flip
// activates every phone-OTP flow in the app at once, once a real SMS
// provider is configured.
export const OTP_ENABLED = false;

export default function ClaimVendorFlow({ navigation, route }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const resume = route?.params?.resume || false;

  const [step, setStep] = useState('category'); // category | subcategories | details | phone-otp | account | documents | email-otp | password
  const [requestCategoryModal, setRequestCategoryModal] = useState(false);

  // Category (parent, mandatory, one of 30) + subcategories (multi-select —
  // each one becomes a real service on the profile once approved)
  const [categoryQuery, setCategoryQuery] = useState('');
  const [categoryGroup, setCategoryGroup] = useState('');
  const [selectedSubcategories, setSelectedSubcategories] = useState([]);

  // Details / existing-listing search
  const [businessName, setBusinessName] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Delhi');
  const [searchingExisting, setSearchingExisting] = useState(false);
  const [selectedExisting, setSelectedExisting] = useState(null); // provider row, or null = new listing

  // Phone OTP
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneCooldown, setPhoneCooldown] = useState(0);

  // Documents
  const [documentType, setDocumentType] = useState('');
  const [documentPath, setDocumentPath] = useState(''); // stringent path (private bucket) or public url (light path)
  const [documentUploading, setDocumentUploading] = useState(false);

  // Email OTP
  const [email, setEmail] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);

  // Password / submit
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const cooldownTimer = useRef(null);

  useEffect(() => {
    if (resume) resumeFlow();
    return () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); };
  }, []);

  async function resumeFlow() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from('users')
      .select('name, phone, city, pending_claim_category').eq('id', session.user.id).maybeSingle();
    if (data?.name) setName(data.name);
    if (data?.phone) setPhone(data.phone);
    if (data?.city) setCity(data.city);
    // pending_claim_category is written right after phone verification and
    // already holds the parent category — subcategory selections themselves
    // aren't persisted, so resume re-collects those rather than the whole
    // flow from scratch.
    if (data?.pending_claim_category) {
      setCategoryGroup(data.pending_claim_category);
      setStep('subcategories');
    } else {
      setStep('details');
    }
  }

  function startCooldown(setCooldownFn) {
    setCooldownFn(60);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldownFn(prev => {
        if (prev <= 1) { clearInterval(cooldownTimer.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  // ── Category step (parent, mandatory) ── nothing shown until they type
  const categoryResults = categoryQuery.trim()
    ? CATEGORY_NAMES.filter(c => c.toLowerCase().includes(categoryQuery.trim().toLowerCase()))
    : [];
  function selectCategory(cat) {
    setCategoryGroup(cat);
    setSelectedSubcategories([]);
    setStep('subcategories');
  }

  // ── Subcategories step — each pick becomes a real service once approved ──
  function toggleSubcategory(sub) {
    setSelectedSubcategories(prev => prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]);
  }
  function continueFromSubcategories() {
    if (selectedSubcategories.length === 0) {
      showAlert('Pick at least one', 'Select at least one service you offer — each one becomes a service on your profile.');
      return;
    }
    setStep('details');
  }

  // ── Details step ──
  // Never browsable — other vendors' unclaimed listing names aren't shown to
  // everyone signing up. Only when what they typed unambiguously matches one
  // existing listing does the app silently pick it up; anything else (no
  // match, or more than one candidate) is treated as a new registration with
  // no list ever rendered.
  useEffect(() => {
    if (step !== 'details' || !businessName.trim()) {
      setSelectedExisting(null);
      return;
    }
    const timer = setTimeout(() => matchExisting(businessName), 350);
    return () => clearTimeout(timer);
  }, [businessName, step]);

  async function matchExisting(q) {
    setSearchingExisting(true);
    try {
      const { data, error } = await supabase.from('providers').select('id, name, category, city')
        .eq('is_claimed', false).ilike('name', `%${q.trim()}%`).limit(2);
      if (error) throw error;
      const matches = (data || []).filter(p => p.name);
      setSelectedExisting(matches.length === 1 ? matches[0] : null);
    } catch (err) {
      console.log('matchExisting error:', err.message);
    } finally {
      setSearchingExisting(false);
    }
  }

  function continueFromDetails() {
    if (!businessName.trim() || !name.trim()) {
      showAlert('Required', 'Please enter your business name and your full name.');
      return;
    }
    if (phone.trim().replace(/\D/g, '').length < 10) {
      showAlert('Invalid phone', 'Please enter a valid 10-digit phone number.');
      return;
    }
    setStep(OTP_ENABLED ? 'phone-otp' : 'account');
  }

  // ── Account step (OTP held) — plain email+password, no verification code ──
  async function createAccountNoOtp() {
    if (!email.trim() || !email.includes('@')) {
      showAlert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      showAlert('Password too short', 'Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
      if (!data.session) throw new Error('Account created — please check your email to confirm, then log in.');

      const { error: upsertError } = await supabase.from('users').upsert({
        id: data.session.user.id,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        role: 'customer',
        city: city.trim() || 'Delhi',
        pending_claim_category: categoryGroup,
      });
      if (upsertError) console.log('users upsert (non-fatal):', upsertError.message);

      setStep('documents');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Phone OTP step ──
  async function sendPhoneOtp() {
    setPhoneSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: '+91' + phone.trim().replace(/\D/g, '') });
      if (error) throw error;
      setPhoneOtpSent(true);
      startCooldown(setPhoneCooldown);
    } catch (err) {
      showAlert('Could not send code', err.message);
    } finally {
      setPhoneSending(false);
    }
  }

  async function verifyPhoneOtp() {
    if (!phoneCode.trim()) {
      showAlert('Enter the code', 'Enter the code sent to your phone.');
      return;
    }
    setPhoneVerifying(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: '+91' + phone.trim().replace(/\D/g, ''),
        token: phoneCode.trim(),
        type: 'sms',
      });
      if (error) throw error;
      if (!data.session) throw new Error('Verification failed — no session returned.');

      // Session exists from this instant — write the users row right away so
      // App.js's role check and PlanScreen.js's resume-redirect both have
      // something real to read, rather than waiting for final submit.
      const { error: upsertError } = await supabase.from('users').upsert({
        id: data.session.user.id,
        name: name.trim(),
        phone: phone.trim(),
        role: 'customer',
        city: city.trim() || 'Delhi',
        pending_claim_category: categoryGroup,
        phone_verified_at: new Date().toISOString(),
      });
      if (upsertError) console.log('users upsert (non-fatal):', upsertError.message);

      setStep('documents');
    } catch (err) {
      showAlert('Verification failed', err.message);
    } finally {
      setPhoneVerifying(false);
    }
  }

  // ── Documents step ──
  const isNewListing = !selectedExisting;

  async function pickLightProof() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (result.canceled) return;
    setDocumentUploading(true);
    try {
      const { url } = await uploadToCloudinary(result.assets[0].uri);
      setDocumentPath(url);
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setDocumentUploading(false);
    }
  }

  async function pickStringentProof() {
    if (!documentType) {
      showAlert('Pick a document type', 'Choose which type of document you\'re uploading first.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled) return;
    setDocumentUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const path = await uploadProviderDocument(result.assets[0].uri, session.user.id, documentType);
      setDocumentPath(path);
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setDocumentUploading(false);
    }
  }

  function continueFromDocuments() {
    if (!isNewListing && !documentPath) {
      showAlert('Proof required', 'Claiming an existing listing needs at least one proof document — this helps us prevent fraudulent claims.');
      return;
    }
    if (OTP_ENABLED) {
      setStep('email-otp');
    } else {
      submitNoOtp();
    }
  }

  async function submitNoOtp() {
    setSubmitting(true);
    try {
      await finalizeClaim();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Email OTP step ──
  async function sendEmailOtp() {
    if (!email.trim() || !email.includes('@')) {
      showAlert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setEmailSending(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim() });
      if (error) throw error;
      setEmailOtpSent(true);
      startCooldown(setEmailCooldown);
    } catch (err) {
      showAlert('Could not send code', err.message);
    } finally {
      setEmailSending(false);
    }
  }

  async function verifyEmailOtp() {
    if (!emailCode.trim()) {
      showAlert('Enter the code', 'Enter the code sent to your email.');
      return;
    }
    setEmailVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(), token: emailCode.trim(), type: 'email_change',
      });
      if (error) throw error;

      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('users').update({ email: email.trim(), email_verified_at: new Date().toISOString() }).eq('id', session.user.id);

      setStep('password');
    } catch (err) {
      showAlert('Verification failed', err.message);
    } finally {
      setEmailVerifying(false);
    }
  }

  // ── Shared final step: create the providers/provider_claims rows against
  // whatever session already exists (real either way — from phone-OTP verify
  // when OTP is on, from createAccountNoOtp's signUp when it's held) ──
  async function finalizeClaim() {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session.user.id;

    let providerId = selectedExisting?.id;
    if (isNewListing) {
      const { data: newProvider, error: insertError } = await supabase.from('providers').insert({
        user_id: userId,
        name: businessName.trim(),
        city: city.trim() || 'Delhi',
        category: categoryGroup,
        is_claimed: false,
        is_active: false,
        is_verified: false,
        rating: 0,
        total_reviews: 0,
      }).select().single();
      if (insertError) throw insertError;
      providerId = newProvider.id;
    }

    const { error: claimError } = await supabase.from('provider_claims').insert({
      provider_id: providerId,
      claimant_user_id: userId,
      claimant_name: name.trim(),
      claimant_phone: phone.trim(),
      business_proof_url: documentPath || null,
      claimed_category: categoryGroup,
      claimed_subcategories: selectedSubcategories,
      document_type: isNewListing ? null : documentType,
    });
    if (claimError) {
      if (claimError.code === '23505') {
        showAlert('Already submitted', 'You have already submitted a claim for this business.');
        return;
      }
      throw claimError;
    }

    await supabase.from('users').update({ pending_claim_category: null }).eq('id', userId);

    // Claiming a business isn't "sign up as a customer" — an account has to
    // exist to satisfy provider_claims' RLS insert check, but the claimant
    // shouldn't be left sitting in the ordinary customer app afterward. Sign
    // out immediately; they log back in with the email/password they just
    // set once their claim is approved.
    await supabase.auth.signOut();
    setSubmitted(true);
  }

  // ── Password step (OTP path only) ──
  async function handleSubmit() {
    if (password.length < 6) {
      showAlert('Password too short', 'Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) throw pwError;
      await finalizeClaim();
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
          Our team will review your submission for "{businessName.trim()}" and email you at {email.trim()} once it's approved. Log back in anytime with the email and password you just set.
        </Text>
        <TouchableOpacity style={s.doneBtn} onPress={() => navigation.navigate('Login')}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const STEP_TITLES = {
    category: 'Your main business category',
    subcategories: 'Which services do you offer?',
    details: 'Business details',
    'phone-otp': 'Verify your phone',
    account: 'Create your account',
    documents: isNewListing ? 'Business photo (optional)' : 'Proof of ownership',
    'email-otp': 'Verify your email',
    password: 'Set a password',
  };

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => (step === 'category' ? navigation.goBack() : goBackStep())} style={s.backBtn}>
            <ArrowLeft size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{STEP_TITLES[step]}</Text>
          <View style={{ width: 30 }} />
        </View>

        {step === 'category' && (
          <View style={s.scroll}>
            <View style={s.logoBox}>
              <SparkleIcon style={s.logoIcon} />
            </View>
            <View style={s.searchBox}>
              <MagnifyingGlass size={18} color={theme.textSecondary} />
              <TextInput
                style={s.searchInput}
                placeholder="Search categories..."
                placeholderTextColor={theme.textTertiary}
                value={categoryQuery}
                onChangeText={setCategoryQuery}
                autoFocus
              />
            </View>
            <FlatList
              data={categoryResults}
              keyExtractor={item => item}
              contentContainerStyle={{ paddingTop: 12, gap: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.categoryRow} onPress={() => selectCategory(item)}>
                  <Text style={s.categoryRowIcon}>{getCategoryIcon(item)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.categoryRowName}>{item}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={categoryQuery.trim() ? (
                <Text style={s.emptyHint}>No match for "{categoryQuery.trim()}" — request it below.</Text>
              ) : null}
            />
            <TouchableOpacity onPress={() => setRequestCategoryModal(true)}>
              <Text style={s.requestCategoryLink}>Don't see your category? Request one →</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'subcategories' && (
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.categoryConfirm}>
              <Text style={s.categoryConfirmText}>{getCategoryIcon(categoryGroup)} {categoryGroup}</Text>
            </View>
            <Text style={s.fieldHint}>Select your services</Text>
            <View style={s.chipsWrap}>
              {getSubcategories(categoryGroup).map(sub => (
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
            <TouchableOpacity style={s.primaryBtn} onPress={continueFromSubcategories}>
              <Text style={s.primaryBtnText}>Continue{selectedSubcategories.length ? ` (${selectedSubcategories.length} selected)` : ''}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 'details' && (
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.categoryConfirm}>
              <Text style={s.categoryConfirmText}>{getCategoryIcon(categoryGroup)} {categoryGroup}</Text>
              <Text style={s.fieldHint}>{selectedSubcategories.length} service{selectedSubcategories.length !== 1 ? 's' : ''} selected</Text>
            </View>

            <Text style={s.label}>Your business name</Text>
            <TextInput style={s.input} placeholder="e.g. Sharma Caterers" placeholderTextColor={theme.textTertiary} value={businessName} onChangeText={t => { setBusinessName(t); setSelectedExisting(null); }} />

            {searchingExisting ? <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 10 }} /> : (
              selectedExisting && (
                <View style={s.matchBox}>
                  <Text style={s.matchBoxText}>✓ We matched this to an existing listing — you're claiming it as yours.</Text>
                  <TouchableOpacity onPress={() => setSelectedExisting(null)}>
                    <Text style={s.requestCategoryLink}>Not this business? Register as new →</Text>
                  </TouchableOpacity>
                </View>
              )
            )}

            <Text style={s.label}>Your full name</Text>
            <TextInput style={s.input} placeholder="Anish Kumar" placeholderTextColor={theme.textTertiary} value={name} onChangeText={setName} />
            <Text style={s.label}>Business phone number</Text>
            <TextInput style={s.input} placeholder="9999999999" placeholderTextColor={theme.textTertiary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Text style={s.label}>City</Text>
            <TextInput style={s.input} placeholder="Delhi" placeholderTextColor={theme.textTertiary} value={city} onChangeText={setCity} />

            <TouchableOpacity style={s.primaryBtn} onPress={continueFromDetails}>
              <Text style={s.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 'phone-otp' && (
          <View style={s.scroll}>
            <Text style={s.otpIntro}>We'll text a verification code to +91 {phone.trim()}</Text>
            {!phoneOtpSent ? (
              <TouchableOpacity style={s.primaryBtn} onPress={sendPhoneOtp} disabled={phoneSending}>
                {phoneSending ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>Send code</Text>}
              </TouchableOpacity>
            ) : (
              <>
                <Text style={s.label}>Enter the 6-digit code</Text>
                <TextInput style={[s.input, s.otpInput]} placeholder="123456" placeholderTextColor={theme.textTertiary} value={phoneCode} onChangeText={setPhoneCode} keyboardType="number-pad" maxLength={6} />
                <TouchableOpacity style={s.primaryBtn} onPress={verifyPhoneOtp} disabled={phoneVerifying}>
                  {phoneVerifying ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>Verify & continue</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={sendPhoneOtp} disabled={phoneCooldown > 0 || phoneSending} style={{ marginTop: 14, alignItems: 'center' }}>
                  <Text style={[s.resendText, phoneCooldown > 0 && { opacity: 0.5 }]}>
                    {phoneCooldown > 0 ? `Resend code in ${phoneCooldown}s` : 'Resend code'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {step === 'account' && (
          <View style={s.scroll}>
            <Text style={s.fieldHint}>Phone and email verification are temporarily on hold — create your account with an email and password for now.</Text>
            <Text style={s.label}>Email address</Text>
            <TextInput style={s.input} placeholder="you@example.com" placeholderTextColor={theme.textTertiary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Text style={s.label}>Password</Text>
            <TextInput style={s.input} placeholder="At least 6 characters" placeholderTextColor={theme.textTertiary} value={password} onChangeText={setPassword} secureTextEntry />
            <TouchableOpacity style={s.primaryBtn} onPress={createAccountNoOtp} disabled={submitting}>
              {submitting ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>Create account & continue</Text>}
            </TouchableOpacity>
          </View>
        )}

        {step === 'documents' && (
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            {isNewListing ? (
              <>
                <Text style={s.fieldHint}>Optional — a storefront photo or shop board helps us approve faster.</Text>
                <TouchableOpacity style={s.uploadBtn} onPress={pickLightProof} disabled={documentUploading}>
                  {documentUploading ? <ActivityIndicator size="small" color={theme.accent} /> : (
                    <>
                      <Upload size={18} color={documentPath ? '#4CAF50' : theme.accent} />
                      <Text style={[s.uploadBtnText, documentPath && { color: '#4CAF50' }]}>
                        {documentPath ? 'Photo uploaded ✓' : 'Upload a photo (optional)'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.fieldHint}>
                  You're claiming an existing listing — upload at least one of these to prove it's yours and prevent duplicate claims.
                </Text>
                <View style={s.chipsWrap}>
                  {DOCUMENT_TYPES.map(dt => (
                    <TouchableOpacity
                      key={dt.key}
                      style={[s.chip, documentType === dt.key && s.chipActive]}
                      onPress={() => { setDocumentType(dt.key === documentType ? '' : dt.key); setDocumentPath(''); }}
                    >
                      <Text style={[s.chipText, documentType === dt.key && s.chipTextActive]}>{dt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={s.uploadBtn} onPress={pickStringentProof} disabled={documentUploading}>
                  {documentUploading ? <ActivityIndicator size="small" color={theme.accent} /> : (
                    <>
                      <Upload size={18} color={documentPath ? '#4CAF50' : theme.accent} />
                      <Text style={[s.uploadBtnText, documentPath && { color: '#4CAF50' }]}>
                        {documentPath ? 'Document uploaded ✓' : 'Upload document'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={s.primaryBtn} onPress={continueFromDocuments} disabled={submitting}>
              {submitting ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>{OTP_ENABLED ? 'Continue' : 'Submit for review'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 'email-otp' && (
          <View style={s.scroll}>
            {!emailOtpSent ? (
              <>
                <Text style={s.label}>Email address</Text>
                <TextInput style={s.input} placeholder="you@example.com" placeholderTextColor={theme.textTertiary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
                <TouchableOpacity style={s.primaryBtn} onPress={sendEmailOtp} disabled={emailSending}>
                  {emailSending ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>Send code</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.otpIntro}>Enter the 6-digit code sent to {email.trim()}</Text>
                <TextInput style={[s.input, s.otpInput]} placeholder="123456" placeholderTextColor={theme.textTertiary} value={emailCode} onChangeText={setEmailCode} keyboardType="number-pad" maxLength={6} />
                <TouchableOpacity style={s.primaryBtn} onPress={verifyEmailOtp} disabled={emailVerifying}>
                  {emailVerifying ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>Verify & continue</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={sendEmailOtp} disabled={emailCooldown > 0 || emailSending} style={{ marginTop: 14, alignItems: 'center' }}>
                  <Text style={[s.resendText, emailCooldown > 0 && { opacity: 0.5 }]}>
                    {emailCooldown > 0 ? `Resend code in ${emailCooldown}s` : 'Resend code'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {step === 'password' && (
          <View style={s.scroll}>
            <Text style={s.label}>Password</Text>
            <TextInput style={s.input} placeholder="At least 6 characters" placeholderTextColor={theme.textTertiary} value={password} onChangeText={setPassword} secureTextEntry />
            <TouchableOpacity style={s.primaryBtn} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>Submit for review</Text>}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
      <RequestCategoryModal visible={requestCategoryModal} onClose={() => setRequestCategoryModal(false)} />
    </SafeAreaView>
  );

  function goBackStep() {
    const order = OTP_ENABLED
      ? ['category', 'subcategories', 'details', 'phone-otp', 'documents', 'email-otp', 'password']
      : ['category', 'subcategories', 'details', 'account', 'documents'];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
  }
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
      borderBottomWidth: 0.5, borderBottomColor: theme.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    backBtn: { padding: 4 },
    scroll: { padding: 20, flexGrow: 1 },

    logoBox: { alignItems: 'center', marginBottom: 16 },
    logoIcon: { fontSize: 28, color: theme.accent, marginBottom: 8 },

    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 14, paddingVertical: 12,
      backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: theme.text },
    categoryRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.cardBg, borderRadius: 14, padding: 14,
      borderWidth: 0.5, borderColor: theme.border,
    },
    categoryRowActive: { borderColor: theme.accent, borderWidth: 1.5 },
    categoryRowIcon: { fontSize: 20 },
    categoryRowName: { fontSize: 14.5, fontWeight: '700', color: theme.text },
    categoryRowMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    emptyHint: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', marginTop: 20 },
    requestCategoryLink: { fontSize: 13, color: theme.accent, fontWeight: '600', marginTop: 16, textAlign: 'center' },

    categoryConfirm: {
      backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13,
      borderWidth: 0.5, borderColor: theme.border, marginBottom: 6,
    },
    categoryConfirmText: { fontSize: 14, fontWeight: '700', color: theme.text },

    matchBox: {
      marginTop: 10, gap: 8, backgroundColor: theme.cardBg, borderRadius: 14,
      padding: 14, borderWidth: 0.5, borderColor: theme.border,
    },
    matchBoxText: { fontSize: 13, color: theme.text, fontWeight: '600' },

    label: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 8, marginTop: 16 },
    fieldHint: { fontSize: 12.5, color: theme.textSecondary, lineHeight: 18 },
    input: { backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, fontSize: 14, borderWidth: 1, borderColor: theme.border, color: theme.text },
    otpInput: { textAlign: 'center', fontSize: 22, letterSpacing: 8, fontWeight: '700' },
    otpIntro: { fontSize: 14, color: theme.textSecondary, marginBottom: 18, lineHeight: 20 },
    resendText: { fontSize: 13, color: theme.accent, fontWeight: '600' },

    primaryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
    primaryBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },

    uploadBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderRadius: 12, paddingVertical: 14, marginTop: 14,
      borderWidth: 1, borderColor: theme.accent, borderStyle: 'dashed',
    },
    uploadBtnText: { fontSize: 14, fontWeight: '600', color: theme.accent },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg },
    chipActive: { backgroundColor: theme.text, borderColor: theme.text },
    chipText: { fontSize: 13, color: theme.textSecondary },
    chipTextActive: { color: theme.bg, fontWeight: '600' },

    successTitle: { fontSize: 22, fontWeight: '800', color: theme.text, marginTop: 16, marginBottom: 8 },
    successText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 22 },
    doneBtn: { backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14, marginTop: 24 },
    doneBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
  });
}
