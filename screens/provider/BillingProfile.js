import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { ArrowLeft, Buildings, FileText } from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import { showAlert, uploadToCloudinary, uploadProviderDocument, getSignedDocumentUrl } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { getParentCategory, getCategoryIcon } from '../../serviceTemplates';

const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Jammu and Kashmir','Ladakh','Chandigarh','Puducherry'
];

const EMPTY = {
  business_name: '', address: '', city: '', state: '', pincode: '',
  gstin: '', pan: '', phone: '', email: '', sac_code: '998554',
  bank_name: '', bank_account: '', bank_ifsc: '', invoice_prefix: 'INV',
  logo_url: '',
  udyam_number: '', pan_card_url: '', udyam_certificate_url: '', gst_certificate_url: '',
};

export default function BillingProfile({ navigation, route }) {
  const { theme } = useTheme();
  const s = styles(theme);
  const returnTo = route?.params?.returnTo; // optional: go straight to invoice after setup

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);
  const [providerId, setProviderId] = useState(null);
  const [existing, setExisting] = useState(false);
  const [statePicker, setStatePicker] = useState(false);
  const [providerCategory, setProviderCategory] = useState(null);
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [uploadingField, setUploadingField] = useState(null); // 'logo' | 'pan_card_url' | 'udyam_certificate_url' | 'gst_certificate_url'
  const [docSignedUrls, setDocSignedUrls] = useState({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
        loadBilling(data.user.id);
        loadProvider(data.user.id);
      }
    });
  }, []);

  async function loadProvider(uid) {
    const { data } = await supabase
      .from('providers').select('id, category, google_maps_url, logo_url').eq('user_id', uid).maybeSingle();
    if (data) {
      setProviderId(data.id);
      setProviderCategory(data.category);
      setGoogleMapsUrl(data.google_maps_url || '');
      set('logo_url', data.logo_url || '');
    }
  }

  async function refreshSignedUrls(data) {
    const [pan, udyam, gst] = await Promise.all([
      getSignedDocumentUrl(data.pan_card_url),
      getSignedDocumentUrl(data.udyam_certificate_url),
      getSignedDocumentUrl(data.gst_certificate_url),
    ]);
    setDocSignedUrls({ pan_card_url: pan, udyam_certificate_url: udyam, gst_certificate_url: gst });
  }

  async function loadBilling(uid) {
    try {
      const { data } = await supabase
        .from('provider_billing')
        .select('*')
        .eq('provider_user_id', uid)
        .maybeSingle();
      if (data) {
        setExisting(true);
        setForm({
          business_name: data.business_name || '',
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          pincode: data.pincode || '',
          gstin: data.gstin || '',
          pan: data.pan || '',
          phone: data.phone || '',
          email: data.email || '',
          sac_code: data.sac_code || '998554',
          bank_name: data.bank_name || '',
          bank_account: data.bank_account || '',
          bank_ifsc: data.bank_ifsc || '',
          invoice_prefix: data.invoice_prefix || 'INV',
          udyam_number: data.udyam_number || '',
          pan_card_url: data.pan_card_url || '',
          udyam_certificate_url: data.udyam_certificate_url || '',
          gst_certificate_url: data.gst_certificate_url || '',
        });
        refreshSignedUrls(data);
      }
    } catch (err) {
      console.log('loadBilling error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  function set(key, val) {
    setForm(p => ({ ...p, [key]: val }));
  }

  async function save() {
    if (!form.business_name.trim()) {
      showAlert('Required', 'Enter your business name.');
      return;
    }
    if (!form.state) {
      showAlert('Required', 'Select your state — needed for correct GST calculation.');
      return;
    }
    if (form.gstin && form.gstin.trim().length !== 15) {
      showAlert('Check GSTIN', 'A GSTIN is 15 characters. Leave it blank if you are not GST-registered.');
      return;
    }
    if (googleMapsUrl.trim() && !/^https?:\/\//i.test(googleMapsUrl.trim())) {
      showAlert('Check Google Maps link', 'Paste the full link starting with https://');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        provider_user_id: userId,
        business_name: form.business_name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state,
        pincode: form.pincode.trim(),
        gstin: form.gstin.trim().toUpperCase(),
        pan: form.pan.trim().toUpperCase(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        sac_code: form.sac_code.trim() || '998554',
        bank_name: form.bank_name.trim(),
        bank_account: form.bank_account.trim(),
        bank_ifsc: form.bank_ifsc.trim().toUpperCase(),
        invoice_prefix: form.invoice_prefix.trim() || 'INV',
        udyam_number: form.udyam_number.trim(),
        pan_card_url: form.pan_card_url || null,
        udyam_certificate_url: form.udyam_certificate_url || null,
        gst_certificate_url: form.gst_certificate_url || null,
      };

      const { error } = existing
        ? await supabase.from('provider_billing').update(payload).eq('provider_user_id', userId)
        : await supabase.from('provider_billing').insert(payload);

      if (error) throw error;

      // logo_url and google_maps_url live on providers, not provider_billing —
      // that table's RLS only ever allows the owning provider to read it at
      // all, but a business logo/Maps link needs to be publicly visible to
      // customers, same as everything else on the providers row.
      if (providerId) {
        const { error: provErr } = await supabase
          .from('providers')
          .update({ google_maps_url: googleMapsUrl.trim() || null, logo_url: form.logo_url || null })
          .eq('id', providerId);
        if (provErr) console.log('providers save error:', provErr.message);
      }

      if (returnTo) {
        navigation.replace(returnTo);
      } else if (Platform.OS === 'web') {
        // RN-Web renders nothing for Alert.alert, including its onPress —
        // show the message and still perform the navigation manually.
        window.alert('Saved\n\nYour billing details are saved.');
        navigation.goBack();
      } else {
        Alert.alert('Saved', 'Your billing details are saved.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  // Uploads stay in local form state until the main Save button is tapped —
  // same as every other field on this screen, so a picked logo/document
  // doesn't silently commit while the rest of the form is still being edited.
  async function pickLogo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled) return;
    setUploadingField('logo');
    try {
      const { url } = await uploadToCloudinary(result.assets[0].uri);
      set('logo_url', url);
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploadingField(null);
    }
  }

  async function pickDocument(key) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled) return;
    setUploadingField(key);
    try {
      const path = await uploadProviderDocument(result.assets[0].uri, userId, key);
      set(key, path);
      const signedUrl = await getSignedDocumentUrl(path);
      setDocSignedUrls(prev => ({ ...prev, [key]: signedUrl }));
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploadingField(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </SafeAreaView>
    );
  }

  const field = (label, key, opts = {}) => (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, opts.multiline && { minHeight: 64, textAlignVertical: 'top', paddingTop: 12 }]}
        placeholder={opts.placeholder || label}
        placeholderTextColor={theme.textSecondary}
        value={form[key]}
        onChangeText={v => set(key, v)}
        keyboardType={opts.keyboardType}
        autoCapitalize={opts.autoCapitalize}
        multiline={opts.multiline}
      />
    </View>
  );

  // A document upload row: shows "Uploaded ✓" + a tappable "View" link once
  // set (signed URL, refreshed on every upload since the private bucket's
  // URLs expire), otherwise an upload button. Same row shape for all three
  // legal documents.
  const docRow = (label, key, hint) => (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      <View style={s.docRow}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <FileText size={18} color={form[key] ? '#4CAF50' : theme.textSecondary} />
          <Text style={[s.docStatus, form[key] && { color: '#4CAF50' }]}>
            {form[key] ? 'Uploaded ✓' : 'Not uploaded'}
          </Text>
        </View>
        {form[key] && docSignedUrls[key] ? (
          <TouchableOpacity onPress={() => Linking.openURL(docSignedUrls[key])}>
            <Text style={s.docViewLink}>View</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={s.docUploadBtn} onPress={() => pickDocument(key)} disabled={uploadingField === key}>
          {uploadingField === key
            ? <ActivityIndicator size="small" color={theme.accent} />
            : <Text style={s.docUploadBtnText}>{form[key] ? 'Replace' : 'Upload'}</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader title="Business Profile" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={s.introCard}>
          <Buildings size={22} color={theme.accent} />
          <Text style={s.introText}>
            This is your business's identity across Utsav — shown to customers and used on every invoice. Leave GSTIN blank if you're not GST-registered — we'll make a Bill of Supply instead.
          </Text>
        </View>

        {providerCategory && (
          <View style={s.categoryConfirmBox}>
            <Text style={s.categoryConfirmLabel}>Your category</Text>
            <Text style={s.categoryConfirmValue}>
              {getCategoryIcon(getParentCategory(providerCategory) || providerCategory)} {getParentCategory(providerCategory) || providerCategory}
            </Text>
            <Text style={s.categoryConfirmSub}>{providerCategory}</Text>
          </View>
        )}

        <Text style={s.sectionTitle}>Business Profile</Text>

        {/* Logo */}
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Business logo</Text>
          <View style={s.logoRow}>
            {form.logo_url ? (
              <Image source={{ uri: form.logo_url }} style={s.logoPreview} />
            ) : (
              <View style={[s.logoPreview, s.logoPreviewEmpty]}>
                <Buildings size={22} color={theme.textSecondary} />
              </View>
            )}
            <TouchableOpacity style={s.docUploadBtn} onPress={pickLogo} disabled={uploadingField === 'logo'}>
              {uploadingField === 'logo'
                ? <ActivityIndicator size="small" color={theme.accent} />
                : <Text style={s.docUploadBtnText}>{form.logo_url ? 'Replace' : 'Upload'}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {field('Business name (as per GST) *', 'business_name')}
        {field('Address', 'address', { multiline: true })}
        <View style={s.row}>
          <View style={{ flex: 1 }}>{field('City', 'city')}</View>
          <View style={{ flex: 1 }}>{field('Pincode', 'pincode', { keyboardType: 'numeric' })}</View>
        </View>

        {/* State picker */}
        <View style={{ gap: 6 }}>
          <Text style={s.label}>State * (for GST calculation)</Text>
          <TouchableOpacity style={s.input} onPress={() => setStatePicker(true)}>
            <Text style={{ color: form.state ? theme.text : theme.textSecondary, fontSize: 15 }}>
              {form.state || 'Select state'} ▾
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.label}>Google Maps / Business listing link</Text>
          <Text style={s.hint}>Paste your listing's Google Maps link — helps us verify your business and lets customers find real reviews.</Text>
          <TextInput
            style={s.input}
            placeholder="https://maps.app.goo.gl/..."
            placeholderTextColor={theme.textSecondary}
            value={googleMapsUrl}
            onChangeText={setGoogleMapsUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        <Text style={s.sectionTitle}>Tax & Compliance</Text>
        {field('GSTIN (leave blank if unregistered)', 'gstin', { autoCapitalize: 'characters', placeholder: '15-character GSTIN' })}
        {docRow('GST certificate', 'gst_certificate_url')}
        {field('PAN', 'pan', { autoCapitalize: 'characters' })}
        {docRow('PAN card', 'pan_card_url')}
        {field('Udyam registration number', 'udyam_number', { autoCapitalize: 'characters', placeholder: 'UDYAM-XX-00-0000000' })}
        {docRow('Udyam certificate', 'udyam_certificate_url')}
        {field('SAC / HSN code', 'sac_code', { placeholder: '998554 (event services)' })}

        <Text style={s.sectionTitle}>Contact</Text>
        {field('Phone', 'phone', { keyboardType: 'phone-pad' })}
        {field('Email', 'email', { keyboardType: 'email-address', autoCapitalize: 'none' })}

        <Text style={s.sectionTitle}>Bank (optional — shows on invoice for payment)</Text>
        {field('Bank name', 'bank_name')}
        {field('Account number', 'bank_account', { keyboardType: 'numeric' })}
        {field('IFSC', 'bank_ifsc', { autoCapitalize: 'characters' })}

        <Text style={s.sectionTitle}>Invoice numbering</Text>
        {field('Invoice prefix', 'invoice_prefix', { placeholder: 'INV' })}
        <Text style={s.hint}>Invoices will be numbered like {form.invoice_prefix || 'INV'}-0001, {form.invoice_prefix || 'INV'}-0002…</Text>

        <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color={theme.bg} /> : <Text style={s.saveBtnText}>Save Business Profile</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* State picker modal */}
      {statePicker && (
        <View style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Select State</Text>
              <TouchableOpacity onPress={() => setStatePicker(false)}>
                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 15 }}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {STATES.map(st => (
                <TouchableOpacity
                  key={st}
                  style={[s.stateRow, form.state === st && { backgroundColor: theme.bgSecondary }]}
                  onPress={() => { set('state', st); setStatePicker(false); }}
                >
                  <Text style={[s.stateText, form.state === st && { color: theme.accent, fontWeight: '700' }]}>{st}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
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
  introCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: theme.accent + '11', borderRadius: 14, padding: 14,
    borderWidth: 0.5, borderColor: theme.accent + '33',
  },
  introText: { flex: 1, fontSize: 12.5, color: theme.textSecondary, lineHeight: 18 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginTop: 8 },
  label: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  input: {
    backgroundColor: theme.bgSecondary, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: theme.text,
    borderWidth: 0.5, borderColor: theme.border, justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: 12 },
  hint: { fontSize: 11, color: theme.textSecondary, marginTop: -8 },
  categoryConfirmBox: {
    backgroundColor: theme.bgSecondary, borderRadius: 14, padding: 14,
    borderWidth: 0.5, borderColor: theme.border,
  },
  categoryConfirmLabel: { fontSize: 11, color: theme.textSecondary, marginBottom: 3 },
  categoryConfirmValue: { fontSize: 15, fontWeight: '700', color: theme.text },
  categoryConfirmSub: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoPreview: { width: 56, height: 56, borderRadius: 14, backgroundColor: theme.bgSecondary },
  logoPreviewEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: theme.border },
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.bgSecondary, borderRadius: 12, padding: 12,
    borderWidth: 0.5, borderColor: theme.border,
  },
  docStatus: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  docViewLink: { fontSize: 13, fontWeight: '700', color: theme.accent },
  docUploadBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
  docUploadBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.text },
  saveBtn: {
    backgroundColor: theme.accent, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 12,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
  pickerOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: theme.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', padding: 20 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  stateRow: { paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border, paddingHorizontal: 4 },
  stateText: { fontSize: 14, color: theme.text },
});