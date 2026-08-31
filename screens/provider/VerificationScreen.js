import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Platform, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { Upload } from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { uploadToCloudinary, callEdgeFunction } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { getParentCategory, getCategoryIcon } from '../../serviceTemplates';
import { OTP_ENABLED } from '../ClaimVendorFlow';

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

  // Provider verification, Task 1 (email) -- a separate signal from the
  // ID-proof review above (existingRequest/is_verified). Reuses
  // users.email_verified_at, the same column ClaimVendorFlow.js's held
  // email-change-OTP step already targets.
  const [userEmail, setUserEmail] = useState('');
  const [emailVerifiedAt, setEmailVerifiedAt] = useState(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailLinkSent, setEmailLinkSent] = useState(false);

  // Provider verification, Task 2 (phone) -- reuses the SAME
  // signInWithOtp/verifyOtp Supabase Auth mechanism ClaimVendorFlow.js
  // already built for phone-OTP at signup (genuinely reusable, confirmed
  // in Task 0 -- the only guest/claim-specific part there is
  // linkGuestAccountByPhone(), which doesn't apply to an already-existing
  // provider account). Gated behind the SAME OTP_ENABLED flag, imported
  // rather than duplicated, so one flip activates both once a real SMS
  // provider is configured (see CLAUDE.md's blockers).
  const [userPhone, setUserPhone] = useState('');
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState(null);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);

  // Provider verification, Task 4 (website, meta-tag method). Lives on
  // providers (not provider_billing) -- see the migration's own comment,
  // same reasoning as logo_url/google_maps_url.
  const [websiteInput, setWebsiteInput] = useState('');
  const [websiteSavedUrl, setWebsiteSavedUrl] = useState('');
  const [websiteToken, setWebsiteToken] = useState('');
  const [websiteMetaTag, setWebsiteMetaTag] = useState('');
  const [websiteVerifiedAt, setWebsiteVerifiedAt] = useState(null);
  const [websiteReachable, setWebsiteReachable] = useState(null); // null | true | false
  const [websiteChecking, setWebsiteChecking] = useState(false);
  const [websiteConfirming, setWebsiteConfirming] = useState(false);

  // Provider verification, Task 5 (Google Business Profile). One-shot --
  // no "recheck" button, matching "one search per provider, ever" (the
  // real enforcement is server-side in verify-google-listing, this is
  // just the client not offering a button that would no-op anyway).
  const [googleCheckedAt, setGoogleCheckedAt] = useState(null);
  const [googleFound, setGoogleFound] = useState(null);
  const [googleListingName, setGoogleListingName] = useState('');
  const [googleListingAddress, setGoogleListingAddress] = useState('');
  const [googleChecking, setGoogleChecking] = useState(false);

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
        .select('id, is_verified, category, website_url, website_verify_token, website_verified_at, google_listing_checked_at, google_listing_found, google_listing_name, google_listing_address')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!provider) return;
      setProviderId(provider.id);
      setIsVerified(provider.is_verified);
      setProviderCategory(provider.category);
      setWebsiteSavedUrl(provider.website_url || '');
      setWebsiteInput(provider.website_url || '');
      setWebsiteToken(provider.website_verify_token || '');
      setWebsiteVerifiedAt(provider.website_verified_at || null);
      if (provider.website_verify_token) {
        setWebsiteMetaTag(`<meta name="utsav-site-verification" content="${provider.website_verify_token}" />`);
      }
      setGoogleCheckedAt(provider.google_listing_checked_at || null);
      setGoogleFound(provider.google_listing_found);
      setGoogleListingName(provider.google_listing_name || '');
      setGoogleListingAddress(provider.google_listing_address || '');

      // Business name now comes from Business Profile (provider_billing) —
      // no separate typed field here anymore, so it can't drift out of sync
      // with what's on invoices/shown to customers.
      const { data: billing } = await supabase
        .from('provider_billing').select('business_name').eq('provider_user_id', session.user.id).maybeSingle();
      if (billing?.business_name) updateForm('businessName', billing.business_name);

      const { data: userRow } = await supabase
        .from('users').select('email, email_verified_at, phone, phone_verified_at').eq('id', session.user.id).maybeSingle();
      if (userRow) {
        setUserEmail(userRow.email || '');
        setEmailVerifiedAt(userRow.email_verified_at || null);
        setUserPhone(userRow.phone || '');
        setPhoneVerifiedAt(userRow.phone_verified_at || null);
      }

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

  // Provider verification, Task 1 (email) -- generates+sends via
  // request-email-verification (server-side token, AWS SES). Non-fatal to
  // the rest of the screen if it fails; the button just re-enables.
  async function sendEmailVerification() {
    setEmailSending(true);
    try {
      const data = await callEdgeFunction('request-email-verification', {});
      if (data.already_verified) {
        setEmailVerifiedAt(new Date().toISOString());
      } else {
        setEmailLinkSent(true);
      }
    } catch (err) {
      showAlert('Could not send link', err.message);
    } finally {
      setEmailSending(false);
    }
  }

  // Provider verification, Task 2 (phone). updateUser({phone}) against the
  // CURRENT session (not signInWithOtp, which is for a pre-login flow) is
  // Supabase Auth's own mechanism for adding/changing a phone number on an
  // already-authenticated account -- it sends the SMS OTP itself, mirroring
  // sendEmailOtp's updateUser({email}) pattern above one-for-one, phone_change
  // in place of email_change.
  async function sendPhoneVerification() {
    if (!userPhone) return;
    setPhoneSending(true);
    try {
      const { error } = await supabase.auth.updateUser({ phone: '+91' + userPhone.replace(/\D/g, '') });
      if (error) throw error;
      setPhoneOtpSent(true);
    } catch (err) {
      showAlert('Could not send code', err.message);
    } finally {
      setPhoneSending(false);
    }
  }

  async function verifyPhoneCode() {
    if (!phoneCode.trim()) {
      showAlert('Enter the code', 'Enter the code sent to your phone.');
      return;
    }
    setPhoneVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: '+91' + userPhone.replace(/\D/g, ''), token: phoneCode.trim(), type: 'phone_change',
      });
      if (error) throw error;
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('users').update({ phone_verified_at: new Date().toISOString() }).eq('id', session.user.id);
      setPhoneVerifiedAt(new Date().toISOString());
      setPhoneOtpSent(false);
    } catch (err) {
      showAlert('Verification failed', err.message);
    } finally {
      setPhoneVerifying(false);
    }
  }

  // Provider verification, Task 4 (website). "check" saves the URL, runs
  // the immediate reachability fetch, and hands back the meta tag to
  // paste. "confirm" is the actual ownership proof -- re-fetches the site
  // and looks for that exact tag.
  async function checkWebsite() {
    if (!websiteInput.trim()) {
      showAlert('Enter a website', 'Enter your website address first.');
      return;
    }
    setWebsiteChecking(true);
    try {
      const data = await callEdgeFunction('verify-website', { action: 'check', url: websiteInput.trim() });
      setWebsiteSavedUrl(data.url);
      setWebsiteToken(data.token);
      setWebsiteMetaTag(data.metaTag);
      setWebsiteReachable(data.reachable);
      setWebsiteVerifiedAt(null); // a fresh/changed check always needs re-confirming
      if (!data.reachable) {
        showAlert('Could not reach this site', "We couldn't load this URL just now. Double-check it's correct and the site is live, then try again.");
      }
    } catch (err) {
      showAlert('Check failed', err.message);
    } finally {
      setWebsiteChecking(false);
    }
  }

  async function copyMetaTag() {
    if (!websiteMetaTag) return;
    await Clipboard.setStringAsync(websiteMetaTag);
    showAlert('Copied', 'Paste this into your site\'s HTML <head>, save/publish, then tap "Verify now".');
  }

  async function confirmWebsite() {
    setWebsiteConfirming(true);
    try {
      await callEdgeFunction('verify-website', { action: 'confirm' });
      setWebsiteVerifiedAt(new Date().toISOString());
    } catch (err) {
      showAlert('Not verified yet', err.message);
    } finally {
      setWebsiteConfirming(false);
    }
  }

  // Provider verification, Task 5 (Google Business Profile). Single call,
  // server enforces the one-search-ever cache -- this just reflects
  // whatever comes back (a fresh search or the already-cached result).
  async function checkGoogleListing() {
    setGoogleChecking(true);
    try {
      const data = await callEdgeFunction('verify-google-listing', {});
      setGoogleCheckedAt(new Date().toISOString());
      setGoogleFound(data.found);
      setGoogleListingName(data.name || '');
      setGoogleListingAddress(data.address || '');
    } catch (err) {
      showAlert('Check failed', err.message);
    } finally {
      setGoogleChecking(false);
    }
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

        {/* Provider verification, Task 1 (email) -- a separate signal from
            the ID-proof review below, so it's shown regardless of that
            review's own state. */}
        {userEmail ? (
          <View style={s.signalRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.signalLabel}>Email</Text>
              <Text style={s.signalValue}>{userEmail}</Text>
            </View>
            {emailVerifiedAt ? (
              <View style={s.signalBadgeVerified}>
                <Text style={s.signalBadgeVerifiedText}>✓ Verified</Text>
              </View>
            ) : emailLinkSent ? (
              <Text style={s.signalSentText}>Link sent — check your inbox</Text>
            ) : (
              <TouchableOpacity style={s.signalBtn} onPress={sendEmailVerification} disabled={emailSending}>
                {emailSending
                  ? <ActivityIndicator size="small" color={theme.accent} />
                  : <Text style={s.signalBtnText}>Send verification link</Text>}
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Provider verification, Task 2 (phone) -- same treatment as
            email above. Held behind OTP_ENABLED like every other phone-OTP
            entry point in the app (see CLAUDE.md's SMS-provider blocker) --
            shows an informational row instead of a broken "send code"
            button while it's off. */}
        {userPhone ? (
          <View style={s.signalRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.signalLabel}>Phone</Text>
              <Text style={s.signalValue}>{userPhone}</Text>
            </View>
            {phoneVerifiedAt ? (
              <View style={s.signalBadgeVerified}>
                <Text style={s.signalBadgeVerifiedText}>✓ Verified</Text>
              </View>
            ) : !OTP_ENABLED ? (
              <Text style={s.signalSentText}>Coming soon</Text>
            ) : phoneOtpSent ? (
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <TextInput
                  style={s.phoneCodeInput}
                  placeholder="123456"
                  placeholderTextColor={theme.textTertiary}
                  value={phoneCode}
                  onChangeText={setPhoneCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <TouchableOpacity style={s.signalBtn} onPress={verifyPhoneCode} disabled={phoneVerifying}>
                  {phoneVerifying
                    ? <ActivityIndicator size="small" color={theme.accent} />
                    : <Text style={s.signalBtnText}>Verify code</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.signalBtn} onPress={sendPhoneVerification} disabled={phoneSending}>
                {phoneSending
                  ? <ActivityIndicator size="small" color={theme.accent} />
                  : <Text style={s.signalBtnText}>Send code</Text>}
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Provider verification, Task 4 (website) -- a bit more involved
            than email/phone (URL input + a two-step check-then-confirm),
            so it's its own card instead of a one-line signal row. */}
        <View style={s.websiteCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.signalLabel}>Website</Text>
            {websiteVerifiedAt && (
              <View style={s.signalBadgeVerified}>
                <Text style={s.signalBadgeVerifiedText}>✓ Verified</Text>
              </View>
            )}
          </View>

          <TextInput
            style={s.input}
            placeholder="yourbusiness.com"
            placeholderTextColor={theme.textTertiary}
            value={websiteInput}
            onChangeText={setWebsiteInput}
            autoCapitalize="none"
            keyboardType="url"
            editable={!websiteVerifiedAt}
          />

          {!websiteVerifiedAt && (
            <TouchableOpacity style={s.websiteCheckBtn} onPress={checkWebsite} disabled={websiteChecking}>
              {websiteChecking
                ? <ActivityIndicator size="small" color={theme.accent} />
                : <Text style={s.websiteCheckBtnText}>Check site</Text>}
            </TouchableOpacity>
          )}

          {!websiteVerifiedAt && websiteReachable !== null && (
            <Text style={websiteReachable ? s.websiteReachableOk : s.websiteReachableBad}>
              {websiteReachable ? '✓ Site is reachable' : '✗ Could not reach this site'}
            </Text>
          )}

          {!websiteVerifiedAt && websiteMetaTag && (
            <View style={s.metaTagBox}>
              <Text style={s.metaTagHint}>Paste this into your site's HTML &lt;head&gt;, save/publish it, then verify:</Text>
              <Text style={s.metaTagCode} selectable numberOfLines={3}>{websiteMetaTag}</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity style={s.signalBtn} onPress={copyMetaTag}>
                  <Text style={s.signalBtnText}>Copy tag</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.websiteVerifyNowBtn} onPress={confirmWebsite} disabled={websiteConfirming}>
                  {websiteConfirming
                    ? <ActivityIndicator size="small" color={theme.btnPrimaryText} />
                    : <Text style={s.websiteVerifyNowBtnText}>Verify now</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Provider verification, Task 5 (Google Business Profile) -- a
            soft positive signal, never a block. No match found reads as
            neutral, not a failure: a real business might simply be
            listed under a slightly different name. */}
        <View style={s.websiteCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.signalLabel}>Google Business Profile</Text>
            {googleFound === true && (
              <View style={s.signalBadgeVerified}>
                <Text style={s.signalBadgeVerifiedText}>✓ Listing found</Text>
              </View>
            )}
          </View>
          {!googleCheckedAt ? (
            <>
              <Text style={s.metaTagHint}>We'll look for a business listing matching your name and city — a good sign for customers, but never required.</Text>
              <TouchableOpacity style={s.websiteCheckBtn} onPress={checkGoogleListing} disabled={googleChecking}>
                {googleChecking
                  ? <ActivityIndicator size="small" color={theme.accent} />
                  : <Text style={s.websiteCheckBtnText}>Check for a listing</Text>}
              </TouchableOpacity>
            </>
          ) : googleFound ? (
            <Text style={s.metaTagHint}>Found: {googleListingName}{googleListingAddress ? ` — ${googleListingAddress}` : ''}</Text>
          ) : (
            <Text style={s.metaTagHint}>No matching listing found — this doesn't affect your verification. If your business is listed under a different name, that's fine.</Text>
          )}
        </View>

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
                : existingRequest.status === 'more_info_needed'
                ? theme.statusPending
                : theme.statusDeclined
            }]}>
              <Text style={[s.statusText, {
                color: existingRequest.status === 'pending'
                  ? theme.statusPendingText
                  : existingRequest.status === 'approved'
                  ? theme.statusConfirmedText
                  : existingRequest.status === 'more_info_needed'
                  ? theme.statusPendingText
                  : theme.statusDeclinedText
              }]}>
                {existingRequest.status === 'pending' ? '⏳ Under review'
                  : existingRequest.status === 'approved' ? '✓ Approved'
                  : existingRequest.status === 'more_info_needed' ? '📝 More info needed'
                  : '✗ Rejected'}
              </Text>
            </View>
            <Text style={s.statusTitle}>
              {existingRequest.status === 'pending'
                ? 'Application under review'
                : existingRequest.status === 'approved'
                ? 'Application approved!'
                : existingRequest.status === 'more_info_needed'
                ? 'We need a bit more from you'
                : 'Application rejected'}
            </Text>
            <Text style={s.statusSub}>
              {existingRequest.status === 'pending'
                ? 'Our team is reviewing your application. This usually takes 2-3 business days.'
                : existingRequest.status === 'approved'
                ? 'Your profile has been verified. The verified badge is now visible on your profile.'
                : existingRequest.status === 'more_info_needed'
                ? "Your application isn't rejected — our team just needs something more before it can be approved. See the note below, then resubmit."
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
            {(existingRequest.status === 'rejected' || existingRequest.status === 'more_info_needed') && (
              <TouchableOpacity
                style={s.reapplyBtn}
                onPress={() => setExistingRequest(null)}
              >
                <Text style={s.reapplyBtnText}>
                  {existingRequest.status === 'more_info_needed' ? 'Update & resubmit →' : 'Submit new application →'}
                </Text>
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
    signalRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, marginBottom: 0,
      padding: 15, backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border,
    },
    signalLabel: { fontSize: 11.5, color: theme.textSecondary, marginBottom: 2 },
    signalValue: { fontSize: 14, fontWeight: '600', color: theme.text },
    signalBadgeVerified: { backgroundColor: theme.statusConfirmed, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
    signalBadgeVerifiedText: { fontSize: 12.5, fontWeight: '700', color: theme.statusConfirmedText },
    signalSentText: { fontSize: 12, color: theme.textSecondary, maxWidth: 130, textAlign: 'right' },
    signalBtn: { borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: theme.accent },
    signalBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.accent },
    phoneCodeInput: {
      width: 110, backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
      fontSize: 14, textAlign: 'center', letterSpacing: 2, borderWidth: 0.5, borderColor: theme.border, color: theme.text,
    },

    websiteCard: {
      margin: 16, marginTop: 0, padding: 15, backgroundColor: theme.cardBg, borderRadius: 16,
      borderWidth: 0.5, borderColor: theme.border, gap: 10,
    },
    websiteCheckBtn: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: theme.accent },
    websiteCheckBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.accent },
    websiteReachableOk: { fontSize: 12.5, fontWeight: '600', color: '#2E7D32' },
    websiteReachableBad: { fontSize: 12.5, fontWeight: '600', color: '#C62828' },
    metaTagBox: { backgroundColor: theme.bgSecondary || theme.bg, borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: theme.border },
    metaTagHint: { fontSize: 11.5, color: theme.textSecondary, marginBottom: 8, lineHeight: 16 },
    metaTagCode: {
      fontSize: 11.5, color: theme.text, backgroundColor: theme.cardBg, borderRadius: 8, padding: 10,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    websiteVerifyNowBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
    websiteVerifyNowBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.btnPrimaryText },
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