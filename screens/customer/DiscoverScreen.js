import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { useSavedProvider } from '../../hooks/useSavedProvider';
import { CATEGORY_NAMES, getSubcategories, getCategoryIcon } from '../../serviceTemplates';
import NotificationBell from '../../components/NotificationBell';
import AppHeader from '../../components/AppHeader';

const CITIES = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Hyderabad'];

// ── Provider card with save/unsave heart ──────────────
function ProviderCard({ provider, onPress, theme }) {
  const { isSaved, loading: saveLoading, toggleSave } = useSavedProvider(provider.id);
  const s = makeStyles(theme);

  return (
    <View style={s.providerCard}>
      <TouchableOpacity
        style={s.providerCardInner}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={s.providerAvatar}>
          <Text style={s.providerAvatarText}>
            {provider.users?.name?.[0] || '?'}
          </Text>
        </View>
        <View style={s.providerInfo}>
          <Text style={s.providerName}>{provider.users?.name}</Text>
          <Text style={s.providerMeta}>
            {provider.category} · {provider.city}
          </Text>
          <View style={s.ratingRow}>
            <Text style={s.star}>⭐</Text>
            <Text style={s.rating}>
              {provider.rating?.toFixed(1) || 'New'}
            </Text>
            <Text style={s.reviews}>
              ({provider.total_reviews || 0} reviews)
            </Text>
            {provider.is_verified && (
              <View style={s.verifiedBadge}>
                <Text style={s.verifiedText}>✓ Verified</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>

      <View style={s.cardActions}>
        <TouchableOpacity
          style={s.heartBtn}
          onPress={toggleSave}
          disabled={saveLoading}
        >
          <Text style={[s.heartIcon, isSaved && s.heartIconSaved]}>
            {isSaved ? '♥' : '♡'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.bookBtn}
          onPress={onPress}
        >
          <Text style={s.bookBtnText}>Book</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────
export default function DiscoverScreen({ navigation, route }) {
  const savedPlanId = route?.params?.savedPlanId || null;
  const eventTitle = route?.params?.eventTitle || null;
  const { theme } = useTheme();
  const [selectedCity, setSelectedCity] = useState('Delhi');
  const [selectedCategory, setSelectedCategory] = useState(route?.params?.presetCategory || null);
  const [searchText, setSearchText] = useState('');
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCities, setShowCities] = useState(false);
  const s = makeStyles(theme);

  // Discover is a tab screen, not a stack screen — it stays mounted across
  // visits, so a useState initial value only ever applies on the very first
  // mount. A checklist task linking here a second time with a different
  // presetCategory (e.g. "Book DJ" after "Confirm venue") needs this to
  // actually re-apply, hence the effect instead of relying on useState alone.
  useEffect(() => {
    if (route?.params?.presetCategory) setSelectedCategory(route.params.presetCategory);
  }, [route?.params?.presetCategory]);

  useEffect(() => {
    fetchProviders();
  }, [selectedCity, selectedCategory]);

  async function fetchProviders() {
    try {
      setLoading(true);
      let query = supabase
        .from('providers')
        .select('*')
        .eq('city', selectedCity)
        .eq('is_active', true)
        .eq('is_claimed', true) // unclaimed listings have no one to answer bookings — don't surface them to customers
        .eq('is_suspended', false)
        .limit(20);

      if (selectedCategory) {
        // Matches providers.category however it's stored: the parent itself
        // (new-format, post claim-flow-redesign) or one of its subcategories
        // (old-format — real providers approved before that change, no bulk
        // migration was done).
        query = query.in('category', [selectedCategory, ...getSubcategories(selectedCategory)]);
      }

      const { data: providersData, error } = await query;
      if (error) throw error;

      if (!providersData?.length) {
        setProviders([]);
        return;
      }

      const userIds = providersData.map(p => p.user_id).filter(Boolean);
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, avatar_url')
        .in('id', userIds);

      const combined = providersData.map(provider => ({
        ...provider,
        users: usersData?.find(u => u.id === provider.user_id) || null,
      }));

      setProviders(combined);
    } catch (err) {
      console.log('Fetch error:', err.message);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredProviders = providers.filter(p =>
    searchText.trim() === '' ||
    p.users?.name?.toLowerCase().includes(searchText.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <AppHeader
        title="Discover"
        large
        theme={theme}
        navigation={navigation}
        rightActions={[
          <TouchableOpacity key="city" style={s.cityBtn} onPress={() => setShowCities(!showCities)}>
            <Text style={s.cityBtnText}>📍 {selectedCity} ▾</Text>
          </TouchableOpacity>,
          <TouchableOpacity key="vendors" style={s.chatVendorsBtn} onPress={() => navigation.navigate('PersonalVendors')}>
            <Text style={s.chatVendorsBtnIcon}>🤝</Text>
          </TouchableOpacity>,
          <NotificationBell key="bell" navigation={navigation} />,
        ]}
      />

      {/* City dropdown */}
      {showCities && (
        <View style={s.cityDropdown}>
          {CITIES.map(city => (
            <TouchableOpacity
              key={city}
              style={[s.cityOption, selectedCity === city && s.cityOptionActive]}
              onPress={() => {
                setSelectedCity(city);
                setShowCities(false);
              }}
            >
              <Text style={[
                s.cityOptionText,
                selectedCity === city && s.cityOptionTextActive
              ]}>
                {city}
              </Text>
              {selectedCity === city && (
                <Text style={s.cityOptionCheck}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Search bar — tapping opens full search screen */}
        <TouchableOpacity
          style={s.searchRow}
          onPress={() => navigation.navigate('Search', { savedPlanId })}
          activeOpacity={0.7}
        >
          <View style={s.searchBox}>
            <Text style={s.searchIcon}>🔍</Text>
            <Text style={s.searchPlaceholder}>
              Search providers, categories...
            </Text>
          </View>
          <View style={s.filterHint}>
            <Text style={s.filterHintText}>⊟</Text>
          </View>
        </TouchableOpacity>

        {/* Categories */}
        <Text style={s.sectionLabel}>CATEGORIES</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.catScroll}
          contentContainerStyle={{ paddingLeft: 20, paddingRight: 8 }}
        >
          <TouchableOpacity
            style={[s.catCard, selectedCategory === null && s.catCardActive]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={s.catIcon}>✨</Text>
            <Text style={[s.catName, selectedCategory === null && s.catNameActive]}>
              All
            </Text>
          </TouchableOpacity>
          {CATEGORY_NAMES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[s.catCard, selectedCategory === cat && s.catCardActive]}
              onPress={() => setSelectedCategory(
                selectedCategory === cat ? null : cat
              )}
            >
              <Text style={s.catIcon}>{getCategoryIcon(cat)}</Text>
              <Text style={[
                s.catName,
                selectedCategory === cat && s.catNameActive
              ]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Section header */}
        <View style={s.sectionRow}>
          <Text style={s.sectionLabel}>
            {selectedCategory
              ? `${selectedCategory.toUpperCase()} · ${selectedCity.toUpperCase()}`
              : `TOP PROVIDERS · ${selectedCity.toUpperCase()}`}
          </Text>
          {selectedCategory && (
            <TouchableOpacity onPress={() => setSelectedCategory(null)}>
              <Text style={s.clearFilter}>Clear ✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {selectedCategory && (
          <TouchableOpacity
            style={s.browseSubsLink}
            onPress={() => navigation.navigate('CategoryList', {
              category: selectedCategory,
              city: selectedCity,
            })}
          >
            <Text style={s.browseSubsLinkText}>Browse {selectedCategory} subcategories →</Text>
          </TouchableOpacity>
        )}

        {/* Provider list */}
        {loading ? (
          <View style={s.centerBox}>
            <ActivityIndicator color={theme.accent} />
            <Text style={s.loadingText}>Finding providers...</Text>
          </View>
        ) : filteredProviders.length === 0 ? (
          <View style={s.centerBox}>
            <Text style={s.emptyIcon}>🔍</Text>
            <Text style={s.emptyTitle}>
              {searchText
                ? `No results for "${searchText}"`
                : `No providers in ${selectedCity}`}
            </Text>
            <Text style={s.emptySubText}>
              {searchText
                ? 'Try a different search term'
                : 'Check back soon as more providers join!'}
            </Text>
            {searchText ? (
              <TouchableOpacity
                style={s.clearSearchBtn}
                onPress={() => setSearchText('')}
              >
                <Text style={s.clearSearchBtnText}>Clear search</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={s.addOwnBtn}
              onPress={() => navigation.navigate('PersonalVendors', { savedPlanId, eventTitle })}
            >
              <Text style={s.addOwnBtnText}>🤝 Add your own vendor instead</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {filteredProviders.map(provider => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                theme={theme}
                onPress={() => navigation.navigate('ProviderProfile', { provider, savedPlanId })}
              />
            ))}
            <TouchableOpacity
              style={s.addOwnLink}
              onPress={() => navigation.navigate('PersonalVendors', { savedPlanId, eventTitle })}
            >
              <Text style={s.addOwnLinkText}>🤝 Can't find the right vendor? Add your own →</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 140 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
    screenTitle: { fontSize: 32, fontWeight: '700', color: theme.text, letterSpacing: -0.4 },
    cityBtn: { backgroundColor: theme.cardBg, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: theme.border },
    cityBtnText: { fontSize: 13, color: theme.text, fontWeight: '600' },
    chatVendorsBtn: { width: 36, height: 36, borderRadius: 14, backgroundColor: theme.cardBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border },
    chatVendorsBtnIcon: { fontSize: 16 },

    // City dropdown
    cityDropdown: { marginHorizontal: 20, backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    cityOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    cityOptionActive: { backgroundColor: theme.bgSecondary },
    cityOptionText: { fontSize: 14, color: theme.textSecondary },
    cityOptionTextActive: { color: theme.text, fontWeight: '600' },
    cityOptionCheck: { fontSize: 14, color: theme.accent, fontWeight: '700' },

    // Search
    searchRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 16, marginBottom: 22 },
    searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1, borderColor: theme.border },
    searchIcon: { fontSize: 14, marginRight: 8 },
    searchPlaceholder: { fontSize: 14, color: theme.textTertiary },
    filterHint: { width: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 1, borderColor: theme.border },
    filterHintText: { fontSize: 15, color: theme.textSecondary },

    // Section labels
    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, paddingHorizontal: 20, marginBottom: 10, letterSpacing: 0.6 },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 20 },
    clearFilter: { fontSize: 12, color: theme.accent, fontWeight: '600' },
    browseSubsLink: { paddingHorizontal: 20, marginBottom: 14 },
    browseSubsLinkText: { fontSize: 12.5, color: theme.accent, fontWeight: '600' },

    // Categories
    catScroll: { flexGrow: 0, marginBottom: 24 },
    catCard: { alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 18, padding: 13, marginRight: 10, borderWidth: 1, borderColor: theme.border, minWidth: 76 },
    catCardActive: { backgroundColor: theme.text, borderColor: theme.text },
    catIcon: { fontSize: 22, marginBottom: 6 },
    catName: { fontSize: 11, color: theme.textSecondary, fontWeight: '600', textAlign: 'center' },
    catNameActive: { color: theme.bg, fontWeight: '700' },

    // Provider cards — soft shadow, no heavy border
    providerCard: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: 20, marginBottom: 14,
      backgroundColor: theme.cardBg, borderRadius: 20,
      borderWidth: 0.5, borderColor: theme.border,
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
    providerCardInner: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 13 },
    providerAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    providerAvatarText: { fontSize: 19, color: '#FFF', fontWeight: '700' },
    providerInfo: { flex: 1 },
    providerName: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 2 },
    providerMeta: { fontSize: 12.5, color: theme.textSecondary, marginBottom: 5 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    star: { fontSize: 11 },
    rating: { fontSize: 12, fontWeight: '700', color: theme.text },
    reviews: { fontSize: 11, color: theme.textSecondary },
    verifiedBadge: { backgroundColor: theme.bgSecondary, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2.5, marginLeft: 2 },
    verifiedText: { fontSize: 10, color: theme.text, fontWeight: '700' },
    cardActions: { flexDirection: 'column', alignItems: 'center', gap: 8, paddingRight: 16, paddingVertical: 16 },
    heartBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.bgSecondary, alignItems: 'center', justifyContent: 'center' },
    heartIcon: { fontSize: 16, color: theme.textSecondary },
    heartIconSaved: { color: '#E85D04' },
    bookBtn: { backgroundColor: theme.btnPrimary, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8 },
    bookBtnText: { color: theme.btnPrimaryText, fontSize: 12, fontWeight: '700' },

    // Empty / loading
    centerBox: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 32 },
    loadingText: { marginTop: 10, fontSize: 13, color: theme.textSecondary },
    emptyIcon: { fontSize: 36, marginBottom: 12, opacity: 0.5 },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 6, textAlign: 'center' },
    emptySubText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
    clearSearchBtn: { marginTop: 16, backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 11, borderWidth: 0.5, borderColor: theme.border },
    clearSearchBtnText: { fontSize: 13, color: theme.text, fontWeight: '600' },
    addOwnBtn: { marginTop: 12, backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 11, borderWidth: 0.5, borderColor: theme.border },
    addOwnBtnText: { fontSize: 13, color: theme.text, fontWeight: '600' },
    addOwnLink: { marginHorizontal: 20, marginTop: 6, paddingVertical: 14, alignItems: 'center' },
    addOwnLinkText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
  });
}