import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch, Alert, Linking, Platform, Modal, TextInput, Image, ActivityIndicator, KeyboardAvoidingView, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { showAlert } from '../../helpers';
import { PencilSimple, Camera } from 'phosphor-react-native';
import AppHeader from '../../components/AppHeader';
import { useCapabilityRules } from '../../hooks/useCapabilities';
import { resolveCapabilities, isEnabled } from '../../lib/capabilities';
import { PUBLIC_WEB_URL } from '../../config';
import { TOUR_DEFINITIONS } from '../../lib/tourTargets';
import { CREAM } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;
const CITIES = ['Delhi', 'Mumbai', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad'];
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी / Hinglish' },
];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const CURRENT_YEAR = new Date().getFullYear();
// Newest-first from a plausible adult minimum age down to 100 — an actual
// customer's birth year is far more likely to be found scrolling just a
// little rather than starting from the 1920s.
const YEARS = Array.from({ length: 88 }, (_, i) => CURRENT_YEAR - 13 - i);

function parseDob(dateOfBirth) {
  if (!dateOfBirth) return { dobDay: null, dobMonth: null, dobYear: null };
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  return { dobDay: d, dobMonth: m - 1, dobYear: y };
}

function formatDob(dateOfBirth) {
  if (!dateOfBirth) return null;
  const { dobDay, dobMonth, dobYear } = parseDob(dateOfBirth);
  return `${dobDay} ${MONTHS[dobMonth]} ${dobYear}`;
}

export default function ProfileScreen({ navigation }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  // This screen is a real "settings list" (per the desktop-shell brief's
  // own carve-out) rather than a list/table, form+preview, or stats/
  // summary fit -- every modal here (city/language/edit-profile/delete-
  // account) is proven, native-pattern UI already. Rather than a bespoke
  // desktop reskin, this just centers the exact same content in a
  // constrained column on wide screens -- "consistent chrome around it
  // matters more than making every screen into a table it was never
  // meant to be."
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [user, setUser] = useState(null);
  const [hostEvents, setHostEvents] = useState([]);
  const { rules: capabilityRules } = useCapabilityRules();
  const showGiftLedger = hostEvents.some(ev => isEnabled(
    resolveCapabilities(capabilityRules, {
      eventTypeSlug: ev.event_type_slug,
      venueType: ev.venue_type,
      guestCount: ev.guest_count,
      age: ev.child_age,
      isDryEvent: ev.is_dry_event,
      isVegOnly: ev.is_veg_only,
      hasBudget: ev.budget_total != null,
    }),
    'reciprocity_ledger'
  ));
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', gender: '', dobDay: null, dobMonth: null, dobYear: null });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const s = makeStyles(theme);

  useEffect(() => { fetchUser(); fetchHostEvents(); }, []);

  async function fetchUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from('users').select('*').eq('id', session.user.id).single();
    setUser(data);
  }

  // ReciprocityLedger.js is deliberately cross-event (the host's whole gift
  // history, not one event's), so there's no single event to resolve
  // capabilities against at its own destination — instead this entry point
  // is shown only if reciprocity_ledger is enabled for at least one of the
  // host's events, same "remove the entry point if it doesn't apply"
  // principle applied one level up, at the one static place this screen is
  // ever linked from. Kept as raw rows in state and resolved during render
  // (below) rather than inside this fetch, since capabilityRules loads
  // asynchronously too and may not be ready yet at mount time.
  async function fetchHostEvents() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      // id/created_at added for the Gate Pass tour's Replay action below
      // (that screen requires a real eventId — unlike Guest List/Checklist,
      // it has no standalone "pick an event" fallback of its own) — reusing
      // this existing per-host events fetch rather than adding a second query.
      const { data, error } = await supabase
        .from('events')
        .select('id, created_at, venue_type, is_dry_event, is_veg_only, event_type_slug, guest_count, child_age, budget_total')
        .eq('host_id', session.user.id);
      if (error) throw error;
      setHostEvents(data || []);
    } catch (err) {
      console.log('fetchHostEvents error:', err.message);
    }
  }

  // Most-recently-created event with a real id — used only as the target
  // for replaying the Gate Pass tour (see TUTORIALS section below).
  const mostRecentEventId = hostEvents.length > 0
    ? [...hostEvents].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].id
    : null;

  function replayTour(tourKey) {
    if (tourKey === 'core_loop') {
      navigation.navigate('CustomerTabs', { screen: 'Plan', params: { forceTour: 'core_loop' } });
    } else if (tourKey === 'guestlist_intro') {
      // No event param — lands on GuestList's own standalone event-picker
      // (same as reaching it from the Tools tile); the tour fires once an
      // event is picked and the real view mounts.
      navigation.navigate('GuestList', { forceTour: 'guestlist_intro' });
    } else if (tourKey === 'eventtodo_intro') {
      navigation.navigate('EventTodo', { forceTour: 'eventtodo_intro' });
    } else if (tourKey === 'gatepass_intro') {
      if (!mostRecentEventId) {
        showAlert('No events yet', 'Create an event plan first, then open Gate Pass from its guest list to replay this tour.');
        return;
      }
      navigation.navigate('GatePass', { eventId: mostRecentEventId, forceTour: 'gatepass_intro' });
    }
  }

  async function updateUser(fields) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.from('users').update(fields).eq('id', session.user.id);
    if (error) {
      showAlert('Error', error.message);
      return;
    }
    setUser(prev => ({ ...prev, ...fields }));
  }

  function openEditProfile() {
    setEditForm({
      name: user?.name || '',
      phone: user?.phone || '',
      address: user?.address || '',
      gender: user?.gender || '',
      ...parseDob(user?.date_of_birth),
    });
    setEditModalVisible(true);
  }

  async function saveEditProfile() {
    if (!editForm.name.trim()) {
      showAlert('Name required', 'Please enter your name.');
      return;
    }
    setSavingProfile(true);
    try {
      const { dobDay, dobMonth, dobYear } = editForm;
      const dateOfBirth = (dobDay && dobMonth !== null && dobYear)
        ? `${dobYear}-${String(dobMonth + 1).padStart(2, '0')}-${String(dobDay).padStart(2, '0')}`
        : null;
      await updateUser({
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        address: editForm.address.trim(),
        gender: editForm.gender || null,
        date_of_birth: dateOfBirth,
      });
      setEditModalVisible(false);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  // Web has no proven upload path in this app yet — every other photo
  // upload flow (album media, portfolio) is native-only for the same
  // reason. Keep that same boundary here instead of guessing at untested
  // web blob-upload code.
  async function pickAvatarImage() {
    if (Platform.OS === 'web') {
      showAlert('Use the mobile app', 'Uploading a profile photo works in the Utsav mobile app.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const asset = result.assets[0];
      const ext = (asset.uri.split('.').pop() || 'jpg').split('?')[0];
      const fileName = `${session.user.id}/avatar-${Date.now()}.${ext}`;

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, decode(base64), {
          contentType: asset.mimeType || 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await updateUser({ avatar_url: publicUrl });
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleCitySelect(city) {
    if (!city.trim()) return;
    setCityModalVisible(false);
    setCityInput('');
    await updateUser({ city: city.trim() });
  }

  async function handleLanguageSelect(value) {
    setLanguageModalVisible(false);
    await updateUser({ language: value });
  }

  async function handleNotificationsToggle(value) {
    setNotifSaving(true);
    try {
      if (value) {
        const { registerForPushNotifications, savePushToken } = await import('../../notifications');
        const token = await registerForPushNotifications();
        if (!token) {
          showAlert(
            'Permission needed',
            'Notifications are blocked for Utsav in your device settings. Enable them there to turn this on.'
          );
          return;
        }
        await savePushToken(token);
        await updateUser({ notifications_enabled: true });
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) await supabase.from('users').update({ push_token: null }).eq('id', session.user.id);
        await updateUser({ notifications_enabled: false });
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setNotifSaving(false);
    }
  }

  async function handleLogout() {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Log out? You will need to sign in again.');
      if (!confirmed) return;
      const { error } = await supabase.auth.signOut();
      if (error) {
        window.alert('Logout failed: ' + error.message);
        console.log('Logout error:', error.message);
      }
    } else {
      Alert.alert('Log out?', 'You will need to sign in again.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.auth.signOut();
            if (error) console.log('Logout error:', error.message);
          }
        }
      ]);
    }
  }

  // Sets the request, immediately signs out, and blocks login via the
  // existing is_suspended gate in App.js (same mechanism admin-suspension
  // already uses) — the row itself, and everything it touches, only
  // actually gets purged 14 days later by the purge-deleted-accounts cron
  // job (see supabase/migrations/account_deletion.sql), giving a recovery
  // window for an accidental tap. This is a plain self-update (RLS already
  // lets a user update their own row) — no edge function needed for the
  // request step, only the eventual purge needs service-role access.
  async function requestAccountDeletion() {
    setDeletingAccount(true);
    try {
      const { error } = await supabase.from('users').update({
        is_suspended: true,
        suspended_reason: 'You requested account deletion. Your data will be permanently removed within 14 days.',
        suspended_at: new Date().toISOString(),
        deletion_requested_at: new Date().toISOString(),
      }).eq('id', user.id);
      if (error) throw error;
      await supabase.auth.signOut();
    } catch (err) {
      showAlert('Error', err.message);
      setDeletingAccount(false);
    }
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <SafeAreaView style={[s.container, isDesktopWeb && { backgroundColor: CREAM }]}>
      <AppHeader
        title="Profile"
        large
        theme={theme}
        navigation={navigation}
        rightActions={[
          <TouchableOpacity
            key="notif"
            style={s.notifBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Text style={s.notifBtnIcon}>🔔</Text>
          </TouchableOpacity>,
        ]}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={isDesktopWeb && ds.centerCol}>

        <View style={s.profileCard}>
          <TouchableOpacity style={s.avatarRing} onPress={pickAvatarImage} disabled={uploadingAvatar}>
            <View style={s.avatar}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={s.avatarImage} />
              ) : (
                <Text style={s.avatarText}>{initials}</Text>
              )}
            </View>
            <View style={s.avatarEditBadge}>
              <Camera size={12} color="#FFF" />
            </View>
          </TouchableOpacity>
          <View style={s.profileInfo}>
            <Text style={s.profileName}>{user?.name || 'Loading...'}</Text>
            <Text style={s.profileEmail}>{user?.email}</Text>
            <Text style={s.profileMeta}>Customer · {user?.city || 'India'}</Text>
            {user?.phone ? <Text style={s.profileMeta}>📞 {user.phone}</Text> : null}
            {user?.address ? <Text style={s.profileMeta} numberOfLines={1}>📍 {user.address}</Text> : null}
            {user?.date_of_birth ? <Text style={s.profileMeta}>🎂 {formatDob(user.date_of_birth)}</Text> : null}
          </View>
          <TouchableOpacity style={s.editProfileBtn} onPress={openEditProfile} accessibilityLabel="Edit profile">
            <PencilSimple size={16} color={theme.text} />
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>PREFERENCES</Text>
        <View style={s.settingsCard}>
          <TouchableOpacity style={s.settingRow} onPress={() => setCityModalVisible(true)}>
            <Text style={s.settingIcon}>🌆</Text>
            <Text style={s.settingLabel}>City</Text>
            <Text style={s.settingValue}>{user?.city || 'Delhi'} ›</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <View style={s.settingRow}>
            <Text style={s.settingIcon}>🌙</Text>
            <Text style={s.settingLabel}>Dark mode</Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.border, true: theme.text }}
              thumbColor={theme.bg}
            />
          </View>
          <View style={s.divider} />
          <View style={s.settingRow}>
            <Text style={s.settingIcon}>🔔</Text>
            <Text style={s.settingLabel}>Notifications</Text>
            <Switch
              value={user?.notifications_enabled ?? true}
              onValueChange={handleNotificationsToggle}
              disabled={notifSaving}
              trackColor={{ false: theme.border, true: theme.text }}
              thumbColor={theme.bg}
            />
          </View>
          <View style={s.divider} />
          <TouchableOpacity style={s.settingRow} onPress={() => setLanguageModalVisible(true)}>
            <Text style={s.settingIcon}>🌐</Text>
            <Text style={s.settingLabel}>Language</Text>
            <Text style={s.settingValue}>
              {LANGUAGES.find(l => l.value === user?.language)?.label || 'English'} ›
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <View style={s.settingsCard}>
          <TouchableOpacity style={s.settingRow} onPress={() => navigation.navigate('MyBookings')}>
            <Text style={s.settingIcon}>📋</Text>
            <Text style={s.settingLabel}>Booking history</Text>
            <Text style={s.settingValue}>›</Text>
          </TouchableOpacity>
          {showGiftLedger && (
            <>
              <View style={s.divider} />
              <TouchableOpacity style={s.settingRow} onPress={() => navigation.navigate('ReciprocityLedger')}>
                <Text style={s.settingIcon}>🎀</Text>
                <Text style={s.settingLabel}>Gift ledger</Text>
                <Text style={s.settingValue}>›</Text>
              </TouchableOpacity>
            </>
          )}
          <View style={s.divider} />
          <TouchableOpacity style={s.settingRow}>
            <Text style={s.settingIcon}>🔒</Text>
            <Text style={s.settingLabel}>Privacy & security</Text>
            <Text style={s.settingValue}>›</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.settingRow} onPress={handleLogout}>
            <Text style={s.settingIcon}>↩</Text>
            <Text style={[s.settingLabel, { color: '#E85D04' }]}>Log out</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.settingRow}
            onPress={() => navigation.navigate('SavedProviders')}
          >
            <Text style={s.settingIcon}>♥</Text>
            <Text style={s.settingLabel}>Saved providers</Text>
            <Text style={s.settingValue}>›</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.settingRow}
            onPress={() => navigation.navigate('BlockedProviders')}
          >
            <Text style={s.settingIcon}>🚫</Text>
            <Text style={s.settingLabel}>Blocked vendors</Text>
            <Text style={s.settingValue}>›</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.settingRow}
            onPress={() => Linking.openURL(`${PUBLIC_WEB_URL}/privacy-policy.html`)}
          >
            <Text style={s.settingIcon}>🔒</Text>
            <Text style={s.settingLabel}>Privacy policy</Text>
            <Text style={s.settingValue}>›</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.settingRow}
            onPress={() => Linking.openURL(`${PUBLIC_WEB_URL}/terms-of-service.html`)}
          >
            <Text style={s.settingIcon}>📄</Text>
            <Text style={s.settingLabel}>Terms of service</Text>
            <Text style={s.settingValue}>›</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.settingRow} onPress={() => setDeleteAccountModal(true)}>
            <Text style={s.settingIcon}>⚠️</Text>
            <Text style={[s.settingLabel, { color: '#E03B3B' }]}>Delete my account</Text>
            <Text style={s.settingValue}>›</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.sectionLabel}>TUTORIALS</Text>
        <View style={s.settingsCard}>
          {TOUR_DEFINITIONS.map((tourDef, i) => (
            <View key={tourDef.key}>
              {i > 0 && <View style={s.divider} />}
              <TouchableOpacity style={s.settingRow} onPress={() => replayTour(tourDef.key)}>
                <Text style={s.settingIcon}>🔁</Text>
                <Text style={s.settingLabel}>{tourDef.label}</Text>
                <Text style={s.settingValue}>Replay ›</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <Text style={[s.version, { color: theme.textTertiary }]}>Utsav v1.0.0</Text>
        <View style={{ height: 140 }} />
      </ScrollView>

      {/* City picker */}
      <Modal visible={cityModalVisible} transparent animationType="fade" onRequestClose={() => setCityModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setCityModalVisible(false)}>
          <TouchableOpacity style={[s.modalCard, isDesktopWeb && ds.modalCardDesktop]} activeOpacity={1} onPress={() => {}}>
            <Text style={s.modalTitle}>Choose your city</Text>
            <View style={s.chipsWrap}>
              {CITIES.map(city => (
                <TouchableOpacity
                  key={city}
                  style={[s.chip, user?.city === city && s.chipActive]}
                  onPress={() => handleCitySelect(city)}
                >
                  <Text style={[s.chipText, user?.city === city && s.chipTextActive]}>{city}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.modalHint}>Not in the list? Type any city:</Text>
            <View style={s.cityInputRow}>
              <TextInput
                style={s.cityInput}
                placeholder="e.g. Jaipur"
                placeholderTextColor={theme.textTertiary}
                value={cityInput}
                onChangeText={setCityInput}
              />
              <TouchableOpacity style={s.cityInputBtn} onPress={() => handleCitySelect(cityInput)} disabled={!cityInput.trim()}>
                <Text style={s.cityInputBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete account confirmation — type-to-confirm, given how
          consequential this is compared to every other action on this
          screen. Closing/backing out leaves the account untouched; only
          the button below, with the exact match typed, does anything. */}
      <Modal
        visible={deleteAccountModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setDeleteAccountModal(false); setDeleteConfirmText(''); }}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => { setDeleteAccountModal(false); setDeleteConfirmText(''); }}
        >
          <TouchableOpacity style={[s.modalCard, isDesktopWeb && ds.modalCardDesktop]} activeOpacity={1} onPress={() => {}}>
            <Text style={s.modalTitle}>Delete your account?</Text>
            <Text style={{ fontSize: 13.5, color: theme.textSecondary, lineHeight: 20, marginBottom: 16 }}>
              You'll be signed out immediately. Your profile, events, guest lists,
              photos, and messages will be permanently deleted after 14 days —
              enough time to change your mind by contacting support. Booking and
              payment records are kept for accounting purposes but are no longer
              linked to you.
            </Text>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 }}>
              Type DELETE to confirm
            </Text>
            <TextInput
              style={s.cityInput}
              placeholder="DELETE"
              placeholderTextColor={theme.textTertiary}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={{
                backgroundColor: deleteConfirmText.trim() === 'DELETE' ? '#E03B3B' : theme.bgTertiary,
                borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14,
              }}
              onPress={requestAccountDeletion}
              disabled={deleteConfirmText.trim() !== 'DELETE' || deletingAccount}
            >
              {deletingAccount ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Delete my account</Text>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Language picker */}
      <Modal visible={languageModalVisible} transparent animationType="fade" onRequestClose={() => setLanguageModalVisible(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setLanguageModalVisible(false)}>
          <TouchableOpacity style={[s.modalCard, isDesktopWeb && ds.modalCardDesktop]} activeOpacity={1} onPress={() => {}}>
            <Text style={s.modalTitle}>Choose your language</Text>
            <Text style={s.modalHint}>Used as the default for voice input on the Plan screen.</Text>
            {LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang.value}
                style={[s.langOption, (user?.language || 'en') === lang.value && s.langOptionActive]}
                onPress={() => handleLanguageSelect(lang.value)}
              >
                <Text style={[s.langOptionText, (user?.language || 'en') === lang.value && s.langOptionTextActive]}>
                  {lang.label}
                </Text>
                {(user?.language || 'en') === lang.value ? <Text style={s.langCheck}>✓</Text> : null}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Edit profile */}
      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={() => setEditModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setEditModalVisible(false)}>
          <TouchableOpacity style={[s.modalCard, isDesktopWeb && ds.modalCardDesktop]} activeOpacity={1} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>Edit profile</Text>

              <Text style={s.fieldLabel}>Name</Text>
              <TextInput
                style={s.fieldInput}
                placeholder="Your name"
                placeholderTextColor={theme.textTertiary}
                value={editForm.name}
                onChangeText={v => setEditForm(p => ({ ...p, name: v }))}
              />

              <Text style={s.fieldLabel}>Mobile number</Text>
              <TextInput
                style={s.fieldInput}
                placeholder="e.g. 9876543210"
                placeholderTextColor={theme.textTertiary}
                value={editForm.phone}
                onChangeText={v => setEditForm(p => ({ ...p, phone: v }))}
                keyboardType="phone-pad"
              />

              <Text style={s.fieldLabel}>Address</Text>
              <TextInput
                style={[s.fieldInput, { minHeight: 60, textAlignVertical: 'top', paddingTop: 12 }]}
                placeholder="Street, area, city"
                placeholderTextColor={theme.textTertiary}
                value={editForm.address}
                onChangeText={v => setEditForm(p => ({ ...p, address: v }))}
                multiline
              />

              <Text style={s.fieldLabel}>
                Date of birth
                {editForm.dobDay && editForm.dobMonth !== null && editForm.dobYear
                  ? `  ·  ${editForm.dobDay} ${MONTHS[editForm.dobMonth]} ${editForm.dobYear}`
                  : ''}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {DAYS.map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[s.dobChip, editForm.dobDay === d && s.dobChipActive]}
                      onPress={() => setEditForm(p => ({ ...p, dobDay: d }))}
                    >
                      <Text style={[s.dobChipText, editForm.dobDay === d && s.dobChipTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {MONTHS.map((m, i) => (
                    <TouchableOpacity
                      key={m}
                      style={[s.dobChip, editForm.dobMonth === i && s.dobChipActive]}
                      onPress={() => setEditForm(p => ({ ...p, dobMonth: i }))}
                    >
                      <Text style={[s.dobChipText, editForm.dobMonth === i && s.dobChipTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {YEARS.map(y => (
                    <TouchableOpacity
                      key={y}
                      style={[s.dobChip, editForm.dobYear === y && s.dobChipActive]}
                      onPress={() => setEditForm(p => ({ ...p, dobYear: y }))}
                    >
                      <Text style={[s.dobChipText, editForm.dobYear === y && s.dobChipTextActive]}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={s.fieldLabel}>Gender</Text>
              <View style={s.chipsWrap}>
                {GENDERS.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[s.chip, editForm.gender === g && s.chipActive]}
                    onPress={() => setEditForm(p => ({ ...p, gender: p.gender === g ? '' : g }))}
                  >
                    <Text style={[s.chipText, editForm.gender === g && s.chipTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={s.saveProfileBtn} onPress={saveEditProfile} disabled={savingProfile}>
                {savingProfile ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveProfileBtnText}>Save</Text>}
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
    screenTitle: { fontSize: 32, fontWeight: '700', color: theme.text, letterSpacing: -0.4 },
    notifBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: theme.cardBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border },
    notifBtnIcon: { fontSize: 18 },

    profileCard: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: 20, marginTop: 16, marginBottom: 28,
      padding: 18, backgroundColor: theme.cardBg, borderRadius: 22,
      borderWidth: 0.5, borderColor: theme.border,
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 14, shadowOffset: { width: 0, height: 5 },
      gap: 14,
    },
    avatarRing: {
      width: 68, height: 68, borderRadius: 34, borderWidth: 2.5, borderColor: theme.accent,
      alignItems: 'center', justifyContent: 'center',
    },
    avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { fontSize: 21, color: '#FFF', fontWeight: '700' },
    avatarEditBadge: {
      position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11,
      backgroundColor: theme.accent, borderWidth: 2, borderColor: theme.cardBg,
      alignItems: 'center', justifyContent: 'center',
    },
    editProfileBtn: {
      width: 34, height: 34, borderRadius: 17, backgroundColor: theme.bg,
      borderWidth: 0.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center',
    },
    profileInfo: { flex: 1 },
    profileName: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 3 },
    profileEmail: { fontSize: 13, color: theme.textSecondary, marginBottom: 2 },
    profileMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },

    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, paddingHorizontal: 20, marginBottom: 10, letterSpacing: 0.6 },
    settingsCard: {
      marginHorizontal: 20, marginBottom: 24,
      backgroundColor: theme.cardBg, borderRadius: 20,
      borderWidth: 0.5, borderColor: theme.border,
      shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
      overflow: 'hidden',
    },
    settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 15, gap: 13 },
    settingIcon: { fontSize: 16, width: 22, textAlign: 'center' },
    settingLabel: { flex: 1, fontSize: 14.5, color: theme.text, fontWeight: '500' },
    settingValue: { fontSize: 13, color: theme.textSecondary },
    divider: { height: 0.5, backgroundColor: theme.border, marginLeft: 53 },

    version: { textAlign: 'center', fontSize: 12, marginTop: 8 },
    notifBtnIcon2: {},

    modalOverlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
    modalCard: {
      backgroundColor: theme.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26,
      padding: 24, paddingBottom: 36,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 14 },
    modalHint: { fontSize: 12.5, color: theme.textSecondary, marginBottom: 12, marginTop: 4 },

    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18,
      borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg,
    },
    chipActive: { backgroundColor: theme.text, borderColor: theme.text },
    chipText: { fontSize: 13, color: theme.textSecondary },
    chipTextActive: { color: theme.bg, fontWeight: '600' },

    fieldLabel: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary, marginBottom: 6, marginTop: 14 },
    dobChip: {
      paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12,
      borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg,
    },
    dobChipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    dobChipText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
    dobChipTextActive: { color: '#FFF' },
    fieldInput: {
      backgroundColor: theme.cardBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14.5, color: theme.text, borderWidth: 0.5, borderColor: theme.border,
    },
    saveProfileBtn: {
      backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 15,
      alignItems: 'center', marginTop: 22,
    },
    saveProfileBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

    cityInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    cityInput: {
      flex: 1, backgroundColor: theme.cardBg, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: theme.text,
      borderWidth: 0.5, borderColor: theme.border,
    },
    cityInputBtn: { backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
    cityInputBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },

    langOption: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 15, paddingHorizontal: 16, borderRadius: 14,
      backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, marginBottom: 10,
    },
    langOptionActive: { borderColor: theme.text },
    langOptionText: { fontSize: 14.5, color: theme.text, fontWeight: '500' },
    langOptionTextActive: { fontWeight: '700' },
    langCheck: { fontSize: 15, color: theme.accent, fontWeight: '700' },
  });
}

// Desktop: just constrains + centers the same content, doesn't restyle it.
// modalCardDesktop turns the mobile edge-to-edge bottom sheet into a
// centered floating card (still the same content/fields/logic inside,
// unchanged) -- a full-width sheet pinned to the bottom of a 1440px
// screen would read as broken, not just "simple."
const ds = StyleSheet.create({
  centerCol: { maxWidth: 640, width: '100%', alignSelf: 'center', paddingTop: 12 },
  modalCardDesktop: { maxWidth: 480, width: '100%', alignSelf: 'center', borderRadius: 22, marginBottom: 40 },
});