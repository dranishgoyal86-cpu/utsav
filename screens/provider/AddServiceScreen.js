import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Switch, Platform, Image, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { SERVICE_TEMPLATES, composeDescription, EVENT_PLANNER, CATEGORY_NAMES, getSubcategories, getParentCategory, resolveParentCategory, getCategoryIcon } from '../../serviceTemplates';
import RequestCategoryModal from '../../components/RequestCategoryModal';
import * as ImagePicker from 'expo-image-picker';
import { uploadToCloudinary } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { useProviderCapabilities } from '../../hooks/useProviderCapabilities';
import { resolveEligiblePaymentTerms, accountAgeDaysFrom, isKycComplete } from '../../lib/paymentTerms';

// Field definitions for the category-specific groups the capability
// resolver (provider_capability_rules) can turn on — kept separate from
// SERVICE_TEMPLATES (which is keyed by subcategory directly) since these are
// keyed by capability_key instead, and which ones show is a resolver
// decision, not a hardcoded per-category branch. Same field-type vocabulary
// as SERVICE_TEMPLATES (number/select/else-multiselect) so the one renderer
// below (renderTemplateField) works for both.
const PROVIDER_CAPABILITY_FIELDS = {
  menu_builder: {
    label: '🍽️ Menu builder', intro: 'What can you cook for a plate?',
    fields: [
      { key: 'cuisines_offered', label: 'Cuisines offered', type: 'multiselect', options: ['North Indian', 'South Indian', 'Chinese', 'Continental', 'Italian', 'Mughlai', 'Live Counters'] },
      { key: 'dishes_per_plate', label: 'Dishes per plate (typical)', type: 'number', placeholder: 'e.g. 12' },
      { key: 'tasting_available', label: 'Tasting session available', type: 'select', options: ['Yes', 'No'] },
    ],
  },
  dietary_certification: {
    label: '🥗 Dietary certification', intro: 'Certifications and dietary options you offer',
    fields: [
      { key: 'dietary_certifications', label: 'Certifications', type: 'multiselect', options: ['FSSAI Licensed', 'Jain Food Available', 'Vegan Options', 'Gluten-Free Options'] },
    ],
  },
  package_tiers: {
    label: '📦 Package tiers', intro: 'Which tiers do you offer?',
    fields: [
      { key: 'package_tier_names', label: 'Tiers offered', type: 'multiselect', options: ['Basic', 'Standard', 'Premium', 'Luxury'] },
    ],
  },
  portfolio_video: {
    label: '🎬 Portfolio video', intro: 'Showreel and turnaround details',
    fields: [
      { key: 'has_showreel', label: 'Showreel available', type: 'select', options: ['Yes', 'No'] },
      { key: 'video_turnaround_days', label: 'Typical delivery time (days)', type: 'number', placeholder: 'e.g. 14' },
    ],
  },
  equipment_inventory: {
    label: '🔧 Equipment inventory', intro: 'What equipment do you bring?',
    fields: [
      { key: 'equipment_list', label: 'Equipment', type: 'multiselect', options: ['Speakers', 'Mics', 'LED Screens', 'Generators', 'Trusses', 'Lighting Rigs'] },
      { key: 'has_backup_equipment', label: 'Backup equipment on standby', type: 'select', options: ['Yes', 'No'] },
    ],
  },
  team_size: {
    label: '👥 Team size', intro: 'How many people typically work an event?',
    fields: [
      { key: 'team_size', label: 'Team size', type: 'number', placeholder: 'e.g. 8' },
    ],
  },
  muhurat_availability: {
    label: '🕉️ Muhurat availability', intro: 'When are you typically available, and in which languages?',
    fields: [
      { key: 'available_muhurats', label: 'Available times', type: 'multiselect', options: ['Morning', 'Afternoon', 'Evening', 'Night'] },
      { key: 'ceremony_languages', label: 'Languages conducted in', type: 'multiselect', options: ['Hindi', 'Sanskrit', 'English', 'Regional'] },
    ],
  },
  age_range_served: {
    label: '🎈 Age range served', intro: 'What ages is this suitable for?',
    fields: [
      { key: 'min_age_served', label: 'Minimum age', type: 'number', placeholder: 'e.g. 3' },
      { key: 'max_age_served', label: 'Maximum age', type: 'number', placeholder: 'e.g. 12' },
    ],
  },
  travel_radius: {
    label: '📍 Travel radius', intro: 'How far will you travel for a booking?',
    fields: [
      { key: 'travel_radius_km', label: 'Travel radius (km)', type: 'number', placeholder: 'e.g. 50' },
    ],
  },
  sub_event_tagging: {
    label: '🏷️ Applicable sub-events', intro: 'Which specific functions does this service suit?',
    fields: [
      { key: 'applicable_sub_events', label: 'Sub-events', type: 'multiselect', options: ['Mehendi', 'Sangeet', 'Haldi', 'Reception', 'Cocktail'] },
    ],
  },
};

const EVENT_TYPES = [
  'Wedding', 'Birthday', 'Corporate',
  'Diwali', 'Engagement', 'Baby Shower',
  'Anniversary', 'Holi', 'Navratri', 'Other'
];

export default function AddServiceScreen({ navigation, route }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const existingService = route?.params?.service || null;
  const isEditing = !!existingService;

  const [title, setTitle] = useState(existingService?.title || '');
  const [description, setDescription] = useState(existingService?.description || '');
  const [priceFrom, setPriceFrom] = useState(existingService?.price_from?.toString() || '');
  const [priceTo, setPriceTo] = useState(existingService?.price_to?.toString() || '');
  const [photos, setPhotos] = useState(existingService?.photos || []);
  const [videos, setVideos] = useState(existingService?.videos || []);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [discountLabel, setDiscountLabel] = useState(existingService?.discount_label || '');
  const [discountPercent, setDiscountPercent] = useState(existingService?.discount_percent?.toString() || '');
  const [rushFeePercent, setRushFeePercent] = useState(existingService?.rush_fee_percent?.toString() || '');
  const [selectedCategory, setSelectedCategory] = useState(existingService?.category || '');
  const [selectedCategoryGroup, setSelectedCategoryGroup] = useState(getParentCategory(existingService?.category) || '');
  const [selectedEventTypes, setSelectedEventTypes] = useState(existingService?.event_types || []);
  const [isActive, setIsActive] = useState(existingService?.is_active !== false);
  const [loading, setLoading] = useState(false);
  const [packageDetails, setPackageDetails] = useState(existingService?.package_details || {});
  const [pendingRequest, setPendingRequest] = useState(null);
  const [providerCategory, setProviderCategory] = useState(null);
  const [requestCategoryModal, setRequestCategoryModal] = useState(false);
  const [usedSubcategories, setUsedSubcategories] = useState([]);
  const [eligiblePaymentOptions, setEligiblePaymentOptions] = useState([]);
  const [selectedPaymentOptionIds, setSelectedPaymentOptionIds] = useState([]);
  const [loadingPaymentOptions, setLoadingPaymentOptions] = useState(true);

  const template = SERVICE_TEMPLATES[selectedCategory];

  // selectedCategory is the subcategory currently being added/edited (e.g.
  // "Caterers", "Pandit") — the same value SERVICE_TEMPLATES is keyed by —
  // which provider_capability_rules.categories is seeded to match directly.
  const providerCapabilities = useProviderCapabilities({
    category: selectedCategory || null,
    servicePrice: parseFloat(priceFrom) || null,
  });
  const capabilityFieldGroups = Object.keys(PROVIDER_CAPABILITY_FIELDS)
    .filter(key => providerCapabilities.byKey[key])
    .map(key => ({ key, ...PROVIDER_CAPABILITY_FIELDS[key] }));

  // A provider with a Major Head only ever sees subcategories under their own
  // Category — the rest of the taxonomy is never shown or selectable, full
  // stop, per the app's category-first rule ("inside the app he should have
  // access to services pertaining to his category only"). No escape hatch.
  // Event Planners are the one deliberate exception (that's the whole point
  // of the upgrade) — they keep the full category picker below.
  // resolveParentCategory (not getParentCategory) because providers.category
  // now stores the parent directly for newly-approved providers, but real
  // providers approved before that change still have a subcategory-level
  // value — this handles both without a bulk data migration.
  const lockedParentCategory = (providerCategory && providerCategory !== EVENT_PLANNER)
    ? resolveParentCategory(providerCategory)
    : null;
  const showLockedCategoryView = !!lockedParentCategory;

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: providerData } = await supabase
        .from('providers').select('id, category').eq('user_id', session.user.id).maybeSingle();
      if (!providerData) return;
      setProviderCategory(providerData.category || null);
      const { data: pending } = await supabase
        .from('category_upgrade_requests').select('requested_category, pending_service_data')
        .eq('provider_id', providerData.id).eq('status', 'pending').maybeSingle();
      setPendingRequest(pending || null);

      // Subcategories this provider already has a service under — hidden
      // from the picker when adding a new one, to prevent duplicates.
      const { data: existing } = await supabase
        .from('services').select('id, category').eq('provider_id', providerData.id);
      setUsedSubcategories(
        (existing || [])
          .filter(sv => !isEditing || sv.id !== existingService.id)
          .map(sv => sv.category)
          .filter(Boolean)
      );
    })();
  }, []);

  // Payment-terms eligibility — separate effect from the one above since it
  // needs its own set of queries (provider signals + the option catalog +
  // existing selections) and shouldn't block the category/subcategory logic
  // above on network round-trips it doesn't need.
  useEffect(() => {
    (async () => {
      try {
        setLoadingPaymentOptions(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: providerRow } = await supabase
          .from('providers')
          .select('id, user_id, is_verified, created_at')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (!providerRow) return;

        // providers.rating is write-once-at-creation and never kept in
        // sync (confirmed — WriteReview.js never updates it) — the real
        // signal is the live average from `reviews`, same as
        // ProviderReviews.js already computes it.
        const { data: reviewRows } = await supabase
          .from('reviews').select('rating').eq('provider_id', providerRow.id);
        const rating = reviewRows?.length
          ? reviewRows.reduce((sum, r) => sum + r.rating, 0) / reviewRows.length
          : 0;

        const { count: completedCount } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('provider_id', providerRow.id)
          .eq('status', 'completed');

        // provider_billing keys off providers.user_id, not providers.id —
        // no direct FK, confirmed in the Route investigation.
        const { data: billing } = await supabase
          .from('provider_billing')
          .select('pan, pan_card_url, bank_account, bank_ifsc')
          .eq('provider_user_id', providerRow.user_id)
          .maybeSingle();

        const signals = {
          rating,
          completedBookings: completedCount || 0,
          isVerified: !!providerRow.is_verified,
          accountAgeDays: accountAgeDaysFrom(providerRow.created_at),
          kycComplete: isKycComplete(billing),
        };

        const { data: allOptions } = await supabase
          .from('payment_term_options')
          .select('*')
          .order('sort_order', { ascending: true });

        const eligible = resolveEligiblePaymentTerms(signals, allOptions || []);
        setEligiblePaymentOptions(eligible);

        if (isEditing) {
          const { data: existingSelections } = await supabase
            .from('service_payment_options')
            .select('payment_term_option_id')
            .eq('service_id', existingService.id);
          const existingIds = (existingSelections || []).map(r => r.payment_term_option_id);
          // Only pre-check selections that are still eligible today — a
          // provider's tier can move in either direction between edits.
          setSelectedPaymentOptionIds(existingIds.filter(id => eligible.some(o => o.id === id)));
        } else if (eligible.length === 1) {
          // Only tier 0 available — nothing to choose, it's the floor.
          setSelectedPaymentOptionIds([eligible[0].id]);
        }
      } catch (err) {
        console.log('Payment terms eligibility error:', err.message);
      } finally {
        setLoadingPaymentOptions(false);
      }
    })();
  }, []);

  function togglePaymentOption(optionId) {
    // Tier-0-only case is unremovable — nothing else to fall back to.
    if (eligiblePaymentOptions.length === 1) return;
    setSelectedPaymentOptionIds(prev =>
      prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]
    );
  }

  // Only filters when adding a brand-new service — editing keeps the full
  // list so the service being edited can keep (or change) its own category.
  function availableSubcategories(parent) {
    const all = getSubcategories(parent);
    return isEditing ? all : all.filter(cat => !usedSubcategories.includes(cat));
  }

  useEffect(() => {
    if (lockedParentCategory && !selectedCategoryGroup) {
      setSelectedCategoryGroup(lockedParentCategory);
    }
  }, [lockedParentCategory]);

  function setPackageField(key, value) {
    setPackageDetails(prev => ({ ...prev, [key]: value }));
  }

  function togglePackageOption(key, option) {
    setPackageDetails(prev => {
      const current = prev[key] || [];
      const next = current.includes(option) ? current.filter(o => o !== option) : [...current, option];
      return { ...prev, [key]: next };
    });
  }

  function generateDescription() {
    const generated = composeDescription(selectedCategory, packageDetails);
    if (!generated) {
      showAlert('Nothing to generate yet', 'Fill in a few package details first.');
      return;
    }
    setDescription(generated);
  }

  function showAlert(title, message, onDismiss) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
      if (onDismiss) onDismiss();
    } else {
      Alert.alert(title, message, onDismiss ? [{ text: 'OK', onPress: onDismiss }] : undefined);
    }
  }

  // No per-service media upload existed anywhere before this — services.photos
  // was a schema column nothing ever wrote to. Kept simple: pick, upload,
  // append — same one-at-a-time pattern as everywhere else in this app that
  // uploads to Cloudinary, just capped lower than a portfolio (this is one
  // service's listing, not a whole business's showcase).
  async function pickPhoto() {
    if (photos.length >= 10) {
      showAlert('Limit reached', 'Up to 10 photos per service.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled) return;
    setUploadingMedia(true);
    try {
      const { url } = await uploadToCloudinary(result.assets[0].uri);
      setPhotos(prev => [...prev, url]);
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploadingMedia(false);
    }
  }

  function removePhoto(url) {
    setPhotos(prev => prev.filter(p => p !== url));
  }

  async function pickVideo() {
    if (videos.length >= 3) {
      showAlert('Limit reached', 'Up to 3 videos per service.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });
    if (result.canceled) return;
    setUploadingMedia(true);
    try {
      const { url } = await uploadToCloudinary(result.assets[0].uri, 'video');
      setVideos(prev => [...prev, url]);
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploadingMedia(false);
    }
  }

  function removeVideo(url) {
    setVideos(prev => prev.filter(v => v !== url));
  }

  function toggleEventType(type) {
    setSelectedEventTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  }

  function validate() {
    if (!title.trim()) {
      showAlert('Missing title', 'Please enter a service title.');
      return false;
    }
    if (!priceFrom || isNaN(parseInt(priceFrom))) {
      showAlert('Missing price', 'Please enter a starting price.');
      return false;
    }
    if (priceTo && parseInt(priceTo) < parseInt(priceFrom)) {
      showAlert('Invalid price range', 'Maximum price must be greater than minimum price.');
      return false;
    }
    if (selectedEventTypes.length === 0) {
      showAlert('Select event types', 'Please select at least one event type this service is for.');
      return false;
    }
    if (!selectedCategoryGroup) {
      showAlert('Select a category', 'Choose the category this service belongs to.');
      return false;
    }
    if (!selectedCategory) {
      showAlert('Select a subcategory', 'Choose the specific service type this service belongs to.');
      return false;
    }
    if (!loadingPaymentOptions && eligiblePaymentOptions.length > 1 && selectedPaymentOptionIds.length === 0) {
      showAlert('Select payment terms', 'Choose at least one payment option to offer for this service.');
      return false;
    }
    return true;
  }

  async function handleSave() {
    if (!validate()) return;
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: providerData, error: providerError } = await supabase
        .from('providers')
        .select('id, category')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (providerError || !providerData) {
        showAlert('Error', 'Provider profile not found.');
        return;
      }

      // First-ever service establishes the provider's Major Head category —
      // every service after that is locked to it (see lockedParentCategory
      // above), so there's no cross-category path to detect here anymore.
      // providers.category stores the PARENT (selectedCategoryGroup), not
      // the subcategory — subcategory-level detail lives on the service
      // itself (category: selectedCategory, set in serviceData below).
      const existingHead = providerData.category;
      await proceedSave(providerData.id, existingHead ? null : selectedCategoryGroup);
    } catch (err) {
      console.log('Save service error:', err.message);
      showAlert('Error', err.message || 'Could not save service.');
      setLoading(false);
    }
  }

  async function proceedSave(providerId, newProviderCategory) {
    try {
      setLoading(true);

      if (newProviderCategory) {
        await supabase.from('providers').update({ category: newProviderCategory }).eq('id', providerId);
      }

      const serviceData = {
        provider_id: providerId,
        title: title.trim(),
        description: description.trim() || null,
        price_from: parseInt(priceFrom),
        price_to: priceTo ? parseInt(priceTo) : null,
        category: selectedCategory || null,
        event_types: selectedEventTypes,
        is_active: isActive,
        package_details: Object.keys(packageDetails).length > 0 ? packageDetails : null,
        photos, videos,
        discount_label: discountLabel.trim() || null,
        discount_percent: discountPercent ? parseFloat(discountPercent) : null,
        rush_fee_percent: rushFeePercent ? parseFloat(rushFeePercent) : null,
      };

      let error, serviceId;
      if (isEditing) {
        const { error: updateError } = await supabase
          .from('services')
          .update(serviceData)
          .eq('id', existingService.id);
        error = updateError;
        serviceId = existingService.id;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('services')
          .insert(serviceData)
          .select('id')
          .single();
        error = insertError;
        serviceId = inserted?.id;
      }

      if (error) throw error;

      // Replace-all: simplest correct approach for a small multi-select
      // (a handful of tiers, not a long list) — delete whatever was there,
      // insert the current selection. Non-fatal on its own: a failure here
      // shouldn't block the service save the provider already confirmed.
      if (serviceId) {
        try {
          await supabase.from('service_payment_options').delete().eq('service_id', serviceId);
          if (selectedPaymentOptionIds.length > 0) {
            await supabase.from('service_payment_options').insert(
              selectedPaymentOptionIds.map(payment_term_option_id => ({ service_id: serviceId, payment_term_option_id }))
            );
          }
        } catch (ptErr) {
          console.log('service_payment_options save error (non-fatal):', ptErr.message);
        }
      }

      showAlert(
        isEditing ? 'Service updated! ✓' : 'Service added! ✓',
        isEditing
          ? 'Your service has been updated successfully.'
          : 'Your new service is now live and visible to customers.',
        () => navigation.goBack()
      );
    } catch (err) {
      console.log('Save service error:', err.message);
      showAlert('Error', err.message || 'Could not save service.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title={isEditing ? 'Edit service' : 'Add new service'}
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.form}>

          {pendingRequest ? (
            <View style={s.pendingBanner}>
              <Text style={s.pendingBannerTitle}>🎪 Event Planner request pending</Text>
              <Text style={s.pendingBannerText}>
                Your request to add "{pendingRequest.pending_service_data?.title}" ({pendingRequest.pending_service_data?.category}) is awaiting admin review.
                You can still add services in your existing category while you wait.
              </Text>
            </View>
          ) : null}

          {showLockedCategoryView ? (
            <>
              <View style={s.fieldGroup}>
                <Text style={s.label}>Category</Text>
                <View style={s.lockedCategoryRow}>
                  <Text style={s.lockedCategoryText}>
                    {getCategoryIcon(lockedParentCategory)} {lockedParentCategory}
                  </Text>
                </View>
              </View>

              <View style={s.fieldGroup}>
                <Text style={s.label}>Subcategory <Text style={s.required}>*</Text></Text>
                <Text style={s.fieldHint}>Pick the specific service type under {lockedParentCategory}.</Text>
                {availableSubcategories(lockedParentCategory).length === 0 ? (
                  <Text style={s.fieldHint}>You've already added a service for every subcategory under {lockedParentCategory}.</Text>
                ) : (
                  <View style={s.chipsWrap}>
                    {availableSubcategories(lockedParentCategory).map(cat => (
                      <TouchableOpacity
                        key={cat}
                        style={[s.chip, selectedCategory === cat && s.chipActive]}
                        onPress={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                      >
                        <Text style={[s.chipText, selectedCategory === cat && s.chipTextActive]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </>
          ) : (
            <>
              <View style={s.fieldGroup}>
                <Text style={s.label}>Category <Text style={s.required}>*</Text></Text>
                <Text style={s.fieldHint}>What kind of service is this? This sets your account's main business category.</Text>
                <View style={s.chipsWrap}>
                  {CATEGORY_NAMES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[s.chip, selectedCategoryGroup === cat && s.chipActive]}
                      onPress={() => {
                        const next = cat === selectedCategoryGroup ? '' : cat;
                        setSelectedCategoryGroup(next);
                        setSelectedCategory('');
                      }}
                    >
                      <Text style={[s.chipText, selectedCategoryGroup === cat && s.chipTextActive]}>
                        {getCategoryIcon(cat)} {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity onPress={() => setRequestCategoryModal(true)}>
                  <Text style={s.changeCategoryLink}>Don't see your category? Request one →</Text>
                </TouchableOpacity>
              </View>

              {selectedCategoryGroup ? (
                <View style={s.fieldGroup}>
                  <Text style={s.label}>Subcategory <Text style={s.required}>*</Text></Text>
                  <Text style={s.fieldHint}>Pick the specific service type under {selectedCategoryGroup}.</Text>
                  {availableSubcategories(selectedCategoryGroup).length === 0 ? (
                    <Text style={s.fieldHint}>You've already added a service for every subcategory under {selectedCategoryGroup}.</Text>
                  ) : (
                    <View style={s.chipsWrap}>
                      {availableSubcategories(selectedCategoryGroup).map(cat => (
                        <TouchableOpacity
                          key={cat}
                          style={[s.chip, selectedCategory === cat && s.chipActive]}
                          onPress={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                        >
                          <Text style={[s.chipText, selectedCategory === cat && s.chipTextActive]}>
                            {cat}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}
            </>
          )}

          <View style={s.fieldGroup}>
            <Text style={s.label}>Service title <Text style={s.required}>*</Text></Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Wedding stage decoration"
              placeholderTextColor={theme.textTertiary}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
            <Text style={s.charHint}>{title.length}/80</Text>
          </View>

          <View style={s.fieldGroup}>
            <Text style={s.label}>Description</Text>
            <TextInput
              style={[s.input, s.textArea]}
              placeholder="Describe what's included in this service — materials, team size, duration, what customers can expect..."
              placeholderTextColor={theme.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={s.charHint}>{description.length}/500</Text>
          </View>

          <View style={s.fieldGroup}>
            <Text style={s.label}>Photos & videos</Text>
            <Text style={s.fieldHint}>Show customers real examples of this service — up to 10 photos and 3 videos.</Text>
            <View style={s.mediaGrid}>
              {photos.map(url => (
                <View key={url} style={s.mediaThumb}>
                  <Image source={{ uri: url }} style={s.mediaThumbImage} />
                  <TouchableOpacity style={s.mediaRemoveBtn} onPress={() => removePhoto(url)}>
                    <Text style={s.mediaRemoveBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {videos.map(url => (
                <View key={url} style={s.mediaThumb}>
                  <View style={[s.mediaThumbImage, s.videoThumbPlaceholder]}>
                    <Text style={{ fontSize: 20 }}>🎬</Text>
                  </View>
                  <TouchableOpacity style={s.mediaRemoveBtn} onPress={() => removeVideo(url)}>
                    <Text style={s.mediaRemoveBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={s.mediaAddBtn} onPress={pickPhoto} disabled={uploadingMedia}>
                {uploadingMedia ? <ActivityIndicator size="small" color={theme.accent} /> : <Text style={s.mediaAddBtnText}>+ Add photo</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={s.mediaAddBtn} onPress={pickVideo} disabled={uploadingMedia}>
                {uploadingMedia ? <ActivityIndicator size="small" color={theme.accent} /> : <Text style={s.mediaAddBtnText}>+ Add video</Text>}
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.fieldGroup}>
            <Text style={s.label}>Price range <Text style={s.required}>*</Text></Text>
            <Text style={s.fieldHint}>
              Set a starting price. Add a max price if your service varies by scope.
            </Text>
            <View style={s.priceRow}>
              <View style={s.priceField}>
                <Text style={s.pricePrefix}>₹</Text>
                <TextInput
                  style={s.priceInput}
                  placeholder="From"
                  placeholderTextColor={theme.textTertiary}
                  value={priceFrom}
                  onChangeText={setPriceFrom}
                  keyboardType="number-pad"
                />
              </View>
              <Text style={s.priceSeparator}>to</Text>
              <View style={s.priceField}>
                <Text style={s.pricePrefix}>₹</Text>
                <TextInput
                  style={s.priceInput}
                  placeholder="Max (optional)"
                  placeholderTextColor={theme.textTertiary}
                  value={priceTo}
                  onChangeText={setPriceTo}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            {priceFrom && !isNaN(parseInt(priceFrom)) ? (
              <Text style={s.pricePreview}>
                Shows as: ₹{parseInt(priceFrom).toLocaleString()}
                {priceTo && !isNaN(parseInt(priceTo)) ? ` – ₹${parseInt(priceTo).toLocaleString()}` : '+'}
              </Text>
            ) : null}
          </View>

          <View style={s.fieldGroup}>
            <Text style={s.label}>Discounts & payment terms</Text>
            <Text style={s.fieldHint}>All optional — leave blank to keep the plain price range above.</Text>

            <Text style={s.subLabel}>Discount (e.g. early-bird offer)</Text>
            <View style={s.priceRow}>
              <TextInput
                style={[s.input, { flex: 2 }]}
                placeholder="Offer label, e.g. Early bird"
                placeholderTextColor={theme.textTertiary}
                value={discountLabel}
                onChangeText={setDiscountLabel}
              />
              <View style={s.priceField}>
                <TextInput
                  style={s.priceInput}
                  placeholder="%"
                  placeholderTextColor={theme.textTertiary}
                  value={discountPercent}
                  onChangeText={setDiscountPercent}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <Text style={s.subLabel}>Rush booking fee (for short-notice bookings)</Text>
            <View style={s.priceField}>
              <TextInput
                style={s.priceInput}
                placeholder="% extra"
                placeholderTextColor={theme.textTertiary}
                value={rushFeePercent}
                onChangeText={setRushFeePercent}
                keyboardType="decimal-pad"
              />
            </View>

          </View>

          {/* Eligibility-gated payment-terms menu (0%/20%/40%/100% advance),
              unlocked by real performance signals (rating, completed
              bookings, verified badge, account age, KYC). The old free-text
              "Advance payment required" % field that used to sit here was
              retired — it was unrestricted (any provider could type any
              number) and has been folded into this system; the underlying
              services.advance_payment_percent column is kept, unused, per
              this project's no-destructive-removal convention. */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Payment terms you offer</Text>
            <Text style={s.fieldHint}>
              {loadingPaymentOptions
                ? 'Checking which options you qualify for…'
                : eligiblePaymentOptions.length === 1
                ? "You're currently only eligible for full payment held until after the event — build up completed bookings, ratings, and verification to unlock earlier advances."
                : 'Select which of your currently-unlocked payment options to offer for this service. More unlock automatically as your track record grows.'}
            </Text>
            {loadingPaymentOptions ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <View style={s.chipsWrap}>
                {eligiblePaymentOptions.map(opt => {
                  const active = selectedPaymentOptionIds.includes(opt.id);
                  const locked = eligiblePaymentOptions.length === 1;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[s.chip, active && s.chipActive]}
                      onPress={() => togglePaymentOption(opt.id)}
                      disabled={locked}
                    >
                      <Text style={[s.chipText, active && s.chipTextActive]}>
                        {active ? '✓ ' : ''}{opt.label}{locked ? ' (only option)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {template ? (
            <View style={s.fieldGroup}>
              <Text style={s.label}>📋 {selectedCategory} package details</Text>
              <Text style={s.fieldHint}>{template.intro}</Text>
              {template.fields.map(field => (
                <View key={field.key} style={{ marginBottom: 16 }}>
                  <Text style={s.templateFieldLabel}>{field.label}</Text>
                  {field.type === 'number' ? (
                    <TextInput
                      style={s.input}
                      placeholder={field.placeholder}
                      placeholderTextColor={theme.textTertiary}
                      value={packageDetails[field.key] || ''}
                      onChangeText={v => setPackageField(field.key, v)}
                      keyboardType="number-pad"
                    />
                  ) : field.type === 'select' ? (
                    <View style={s.chipsWrap}>
                      {field.options.map(opt => (
                        <TouchableOpacity
                          key={opt}
                          style={[s.chip, packageDetails[field.key] === opt && s.chipActive]}
                          onPress={() => setPackageField(field.key, opt === packageDetails[field.key] ? '' : opt)}
                        >
                          <Text style={[s.chipText, packageDetails[field.key] === opt && s.chipTextActive]}>{opt}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View style={s.chipsWrap}>
                      {field.options.map(opt => {
                        const active = (packageDetails[field.key] || []).includes(opt);
                        return (
                          <TouchableOpacity
                            key={opt}
                            style={[s.chip, active && s.chipActive]}
                            onPress={() => togglePackageOption(field.key, opt)}
                          >
                            <Text style={[s.chipText, active && s.chipTextActive]}>{active ? '✓ ' : ''}{opt}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}
              <TouchableOpacity style={s.generateBtn} onPress={generateDescription}>
                <Text style={s.generateBtnText}>✨ Generate description from package details</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Category-specific field groups from the capability resolver — a
              caterer sees menu builder + dietary certification, a pandit
              sees muhurat availability, neither sees the other's fields.
              Which groups appear is entirely a provider_capability_rules
              lookup, not a hardcoded category check. */}
          {capabilityFieldGroups.map(group => (
            <View key={group.key} style={s.fieldGroup}>
              <Text style={s.label}>{group.label}</Text>
              <Text style={s.fieldHint}>{group.intro}</Text>
              {group.fields.map(field => (
                <View key={field.key} style={{ marginBottom: 16 }}>
                  <Text style={s.templateFieldLabel}>{field.label}</Text>
                  {field.type === 'number' ? (
                    <TextInput
                      style={s.input}
                      placeholder={field.placeholder}
                      placeholderTextColor={theme.textTertiary}
                      value={packageDetails[field.key] || ''}
                      onChangeText={v => setPackageField(field.key, v)}
                      keyboardType="number-pad"
                    />
                  ) : field.type === 'select' ? (
                    <View style={s.chipsWrap}>
                      {field.options.map(opt => (
                        <TouchableOpacity
                          key={opt}
                          style={[s.chip, packageDetails[field.key] === opt && s.chipActive]}
                          onPress={() => setPackageField(field.key, opt === packageDetails[field.key] ? '' : opt)}
                        >
                          <Text style={[s.chipText, packageDetails[field.key] === opt && s.chipTextActive]}>{opt}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View style={s.chipsWrap}>
                      {(field.options || []).map(opt => {
                        const active = (packageDetails[field.key] || []).includes(opt);
                        return (
                          <TouchableOpacity
                            key={opt}
                            style={[s.chip, active && s.chipActive]}
                            onPress={() => togglePackageOption(field.key, opt)}
                          >
                            <Text style={[s.chipText, active && s.chipTextActive]}>{active ? '✓ ' : ''}{opt}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}

          <View style={s.fieldGroup}>
            <Text style={s.label}>
              Suitable for <Text style={s.required}>*</Text>
            </Text>
            <Text style={s.fieldHint}>
              Select all event types this service is suitable for
            </Text>
            <View style={s.chipsWrap}>
              {EVENT_TYPES.map(type => (
                <TouchableOpacity
                  key={type}
                  style={[s.chip, selectedEventTypes.includes(type) && s.chipActive]}
                  onPress={() => toggleEventType(type)}
                >
                  <Text style={[s.chipText, selectedEventTypes.includes(type) && s.chipTextActive]}>
                    {selectedEventTypes.includes(type) ? '✓ ' : ''}{type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.fieldGroup}>
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Active listing</Text>
                <Text style={s.fieldHint}>
                  {isActive
                    ? 'Visible to customers — they can book this service'
                    : 'Hidden from customers — they cannot book this service'}
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: theme.border, true: theme.text }}
                thumbColor={theme.bg}
              />
            </View>
          </View>

          <View style={s.tipsBox}>
            <Text style={s.tipsTitle}>💡 Tips for a great listing</Text>
            <Text style={s.tipsText}>
              · Be specific — "400 balloon arch setup" beats "balloon decoration"{'\n'}
              · Add what's included — team size, hours, materials{'\n'}
              · Set a realistic starting price — low prices attract more enquiries{'\n'}
              · Select all relevant event types to appear in more searches
            </Text>
          </View>

        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
        <TouchableOpacity
          style={[s.saveBtn, loading && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={theme.btnPrimaryText} />
            : <Text style={s.saveBtnText}>
                {isEditing ? 'Save changes' : 'Add service →'}
              </Text>
          }
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
      <RequestCategoryModal visible={requestCategoryModal} onClose={() => setRequestCategoryModal(false)} />
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },

    form: { padding: 16 },
    pendingBanner: {
      backgroundColor: theme.accent + '18', borderRadius: 14, padding: 14,
      borderWidth: 0.5, borderColor: theme.accent + '55', marginBottom: 22,
    },
    pendingBannerTitle: { fontSize: 13.5, fontWeight: '700', color: theme.text, marginBottom: 4 },
    pendingBannerText: { fontSize: 12, color: theme.textSecondary, lineHeight: 17 },
    fieldGroup: { marginBottom: 26 },
    label: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 5 },
    subLabel: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary, marginBottom: 6, marginTop: 12 },
    mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    mediaThumb: { width: 72, height: 72, position: 'relative' },
    mediaThumbImage: { width: 72, height: 72, borderRadius: 12, backgroundColor: theme.cardBg },
    videoThumbPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: theme.border },
    mediaRemoveBtn: {
      position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
      backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center',
    },
    mediaRemoveBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
    mediaAddBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    mediaAddBtnText: { fontSize: 13, fontWeight: '700', color: theme.text },
    required: { color: theme.accent },
    fieldHint: { fontSize: 12, color: theme.textSecondary, marginBottom: 11, lineHeight: 18 },
    lockedCategoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, borderWidth: 0.5, borderColor: theme.border },
    lockedCategoryText: { fontSize: 14, fontWeight: '700', color: theme.text },
    changeCategoryLink: { fontSize: 12, color: theme.accent, fontWeight: '600' },
    input: { backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, fontSize: 14, borderWidth: 0.5, borderColor: theme.border, color: theme.text },
    textArea: { minHeight: 120, textAlignVertical: 'top', lineHeight: 22 },
    charHint: { fontSize: 11, color: theme.textTertiary, textAlign: 'right', marginTop: 5 },

    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    priceField: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 13, borderWidth: 0.5, borderColor: theme.border },
    pricePrefix: { fontSize: 16, color: theme.textSecondary, marginRight: 4 },
    priceInput: { flex: 1, paddingVertical: 13, fontSize: 14, color: theme.text },
    priceSeparator: { fontSize: 13, color: theme.textSecondary },
    pricePreview: { fontSize: 12, color: theme.accent, fontWeight: '700', marginTop: 9 },

    templateFieldLabel: { fontSize: 12.5, fontWeight: '600', color: theme.text, marginBottom: 7 },
    generateBtn: {
      alignSelf: 'flex-start', backgroundColor: theme.cardBg, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 10, borderWidth: 0.5, borderColor: theme.accent,
    },
    generateBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.accent },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg },
    chipActive: { backgroundColor: theme.text, borderColor: theme.text },
    chipText: { fontSize: 13, color: theme.textSecondary },
    chipTextActive: { color: theme.bg, fontWeight: '600' },

    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

    tipsBox: { backgroundColor: theme.cardBg, borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: theme.border },
    tipsTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 9 },
    tipsText: { fontSize: 12, color: theme.textSecondary, lineHeight: 22 },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    saveBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    saveBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },
  });
}