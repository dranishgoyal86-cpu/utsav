import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Modal, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { useSavedProvider } from '../../hooks/useSavedProvider';
import { CATEGORY_NAMES, getSubcategories, getCategoryIcon, getParentCategory } from '../../serviceTemplates';
import AppHeader from '../../components/AppHeader';
import { CREAM } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

const CITIES = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Hyderabad'];

const EVENT_TYPES = [
  'Wedding', 'Birthday', 'Corporate',
  'Diwali', 'Engagement', 'Baby Shower',
  'Anniversary', 'Holi', 'Navratri',
];

const BUDGET_RANGES = [
  { label: 'Under ₹10K', min: 0, max: 10000 },
  { label: '₹10K – ₹25K', min: 10000, max: 25000 },
  { label: '₹25K – ₹50K', min: 25000, max: 50000 },
  { label: '₹50K – ₹1L', min: 50000, max: 100000 },
  { label: '₹1L – ₹3L', min: 100000, max: 300000 },
  { label: 'Above ₹3L', min: 300000, max: 9999999 },
];

const RATING_OPTIONS = [
  { label: '4.5+ ⭐', value: 4.5 },
  { label: '4.0+ ⭐', value: 4.0 },
  { label: '3.5+ ⭐', value: 3.5 },
  { label: 'Any rating', value: 0 },
];

const SORT_OPTIONS = [
  { label: 'Best rated', value: 'rating' },
  { label: 'Most reviewed', value: 'reviews' },
  { label: 'Newest first', value: 'newest' },
  { label: 'Verified only', value: 'verified' },
];

const DEFAULT_FILTERS = {
  query: '',
  categories: [],
  cities: [],
  eventTypes: [],
  budget: null,
  minRating: 0,
  sort: 'rating',
  verifiedOnly: false,
};

// ── Provider result card ──────────────────────────────
function ProviderResultCard({ provider, onPress, theme }) {
  const { isSaved, loading: saveLoading, toggleSave } = useSavedProvider(provider.id);
  const s = makeStyles(theme);

  return (
    <View style={s.resultCard}>
      <TouchableOpacity
        style={s.resultCardInner}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={s.resultAvatar}>
          <Text style={s.resultAvatarText}>
            {provider.users?.name?.[0] || '?'}
          </Text>
        </View>
        <View style={s.resultInfo}>
          <View style={s.resultNameRow}>
            <Text style={s.resultName}>{provider.users?.name}</Text>
            {provider.is_verified && (
              <View style={s.verifiedBadge}>
                <Text style={s.verifiedText}>✓</Text>
              </View>
            )}
          </View>
          <Text style={s.resultMeta}>
            {provider.category} · {provider.city}
          </Text>
          <View style={s.resultRatingRow}>
            <Text style={s.resultStars}>⭐</Text>
            <Text style={s.resultRating}>
              {provider.rating?.toFixed(1) || 'New'}
            </Text>
            <Text style={s.resultReviews}>
              ({provider.total_reviews || 0} reviews)
            </Text>
          </View>
          {provider.min_price > 0 && (
            <Text style={s.resultPrice}>
              From ₹{provider.min_price?.toLocaleString()}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={s.heartBtn}
        onPress={toggleSave}
        disabled={saveLoading}
      >
        <Text style={[s.heartIcon, isSaved && s.heartIconSaved]}>
          {isSaved ? '♥' : '♡'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Filter modal ─────────────────────────────────────
function FilterModal({ visible, filters, onApply, onClose, theme }) {
  const [local, setLocal] = useState(filters);
  const [expandedCategories, setExpandedCategories] = useState([]);
  const s = makeStyles(theme);

  useEffect(() => {
    if (visible) {
      setLocal(filters);
      // Auto-expand any parent category that already has a selected subcategory.
      setExpandedCategories([...new Set(filters.categories.map(getParentCategory).filter(Boolean))]);
    }
  }, [visible]);

  function toggleExpanded(cat) {
    setExpandedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  }

  function toggle(key, value) {
    setLocal(prev => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter(v => v !== value)
        : [...prev[key], value],
    }));
  }

  function activeCount() {
    let count = 0;
    if (local.categories.length) count++;
    if (local.cities.length) count++;
    if (local.eventTypes.length) count++;
    if (local.budget) count++;
    if (local.minRating > 0) count++;
    if (local.verifiedOnly) count++;
    return count;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          {/* Modal header */}
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>Filters</Text>
            <TouchableOpacity onPress={() => setLocal(DEFAULT_FILTERS)}>
              <Text style={s.modalReset}>Reset all</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>

            {/* Sort */}
            <View style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Sort by</Text>
              <View style={s.chipsWrap}>
                {SORT_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.chip, local.sort === opt.value && s.chipActive]}
                    onPress={() => setLocal(prev => ({ ...prev, sort: opt.value }))}
                  >
                    <Text style={[s.chipText, local.sort === opt.value && s.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Category */}
            <View style={s.filterSection}>
              <Text style={s.filterSectionTitle}>
                Category
                {local.categories.length > 0 && (
                  <Text style={s.filterCount}> · {local.categories.length} selected</Text>
                )}
              </Text>
              <Text style={s.filterSectionHint}>Tap a category to see its subcategories.</Text>
              <View style={s.chipsWrap}>
                {CATEGORY_NAMES.map(cat => {
                  const selectedCount = getSubcategories(cat).filter(sub => local.categories.includes(sub)).length;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[s.chip, selectedCount > 0 && s.chipActive]}
                      onPress={() => toggleExpanded(cat)}
                    >
                      <Text style={[s.chipText, selectedCount > 0 && s.chipTextActive]}>
                        {getCategoryIcon(cat)} {cat}{selectedCount > 0 ? ` (${selectedCount})` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {expandedCategories.map(cat => (
                <View key={cat} style={s.subcategoryBlock}>
                  <Text style={s.subcategoryLabel}>{cat}</Text>
                  <View style={s.chipsWrap}>
                    {getSubcategories(cat).map(sub => (
                      <TouchableOpacity
                        key={sub}
                        style={[s.chip, local.categories.includes(sub) && s.chipActive]}
                        onPress={() => toggle('categories', sub)}
                      >
                        <Text style={[s.chipText, local.categories.includes(sub) && s.chipTextActive]}>
                          {local.categories.includes(sub) ? '✓ ' : ''}{sub}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </View>

            {/* City */}
            <View style={s.filterSection}>
              <Text style={s.filterSectionTitle}>
                City
                {local.cities.length > 0 && (
                  <Text style={s.filterCount}> · {local.cities.length} selected</Text>
                )}
              </Text>
              <View style={s.chipsWrap}>
                {CITIES.map(city => (
                  <TouchableOpacity
                    key={city}
                    style={[s.chip, local.cities.includes(city) && s.chipActive]}
                    onPress={() => toggle('cities', city)}
                  >
                    <Text style={[s.chipText, local.cities.includes(city) && s.chipTextActive]}>
                      {local.cities.includes(city) ? '✓ ' : ''}{city}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Event type */}
            <View style={s.filterSection}>
              <Text style={s.filterSectionTitle}>
                Event type
                {local.eventTypes.length > 0 && (
                  <Text style={s.filterCount}> · {local.eventTypes.length} selected</Text>
                )}
              </Text>
              <View style={s.chipsWrap}>
                {EVENT_TYPES.map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[s.chip, local.eventTypes.includes(type) && s.chipActive]}
                    onPress={() => toggle('eventTypes', type)}
                  >
                    <Text style={[s.chipText, local.eventTypes.includes(type) && s.chipTextActive]}>
                      {local.eventTypes.includes(type) ? '✓ ' : ''}{type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Budget */}
            <View style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Budget range</Text>
              <View style={s.chipsWrap}>
                {BUDGET_RANGES.map(range => {
                  const isActive = local.budget?.label === range.label;
                  return (
                    <TouchableOpacity
                      key={range.label}
                      style={[s.chip, isActive && s.chipActive]}
                      onPress={() => setLocal(prev => ({
                        ...prev,
                        budget: isActive ? null : range,
                      }))}
                    >
                      <Text style={[s.chipText, isActive && s.chipTextActive]}>
                        {isActive ? '✓ ' : ''}{range.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Min rating */}
            <View style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Minimum rating</Text>
              <View style={s.chipsWrap}>
                {RATING_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.chip, local.minRating === opt.value && s.chipActive]}
                    onPress={() => setLocal(prev => ({ ...prev, minRating: opt.value }))}
                  >
                    <Text style={[s.chipText, local.minRating === opt.value && s.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Verified only */}
            <View style={s.filterSection}>
              <TouchableOpacity
                style={s.toggleRow}
                onPress={() => setLocal(prev => ({
                  ...prev, verifiedOnly: !prev.verifiedOnly
                }))}
              >
                <View>
                  <Text style={s.toggleLabel}>Verified providers only</Text>
                  <Text style={s.toggleSub}>
                    Show only providers with verified badge
                  </Text>
                </View>
                <View style={[s.toggle, local.verifiedOnly && s.toggleActive]}>
                  <View style={[
                    s.toggleThumb,
                    local.verifiedOnly && s.toggleThumbActive
                  ]} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>

          {/* Apply button */}
          <View style={s.modalFooter}>
            <TouchableOpacity
              style={s.applyBtn}
              onPress={() => onApply(local)}
            >
              <Text style={s.applyBtnText}>
                Apply filters
                {activeCount() > 0 ? ` (${activeCount()})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main search screen ────────────────────────────────
export default function SearchScreen({ navigation, route }) {
  const savedPlanId = route?.params?.savedPlanId || null;
  const { theme } = useTheme();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searched, setSearched] = useState(false);
  const [query, setQuery] = useState('');
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  // Lightest-touch treatment (centered, not restyled) -- same call as
  // CreateBookingScreen.js, this screen's own results list/filter modal
  // are real, dense logic not worth a second bespoke reskin.
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  // Arriving with a preset (e.g. "Browse Banquet Halls in Delhi" from the
  // event planner) pre-applies those filters — the existing debounced
  // [query, filters] effect below picks this up and runs the search itself.
  useEffect(() => {
    const { presetCategory, presetCity } = route?.params || {};
    if (!presetCategory && !presetCity) return;
    setFilters(prev => ({
      ...prev,
      categories: presetCategory ? [presetCategory] : prev.categories,
      cities: presetCity ? [presetCity] : prev.cities,
    }));
  }, [route?.params?.presetCategory, route?.params?.presetCity]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length > 0 || hasActiveFilters()) {
        runSearch({ ...filters, query });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, filters]);

  function hasActiveFilters() {
    return filters.categories.length > 0 ||
      filters.cities.length > 0 ||
      filters.eventTypes.length > 0 ||
      filters.budget !== null ||
      filters.minRating > 0 ||
      filters.verifiedOnly;
  }

  function activeFilterCount() {
    let count = 0;
    if (filters.categories.length) count += filters.categories.length;
    if (filters.cities.length) count += filters.cities.length;
    if (filters.eventTypes.length) count += filters.eventTypes.length;
    if (filters.budget) count++;
    if (filters.minRating > 0) count++;
    if (filters.verifiedOnly) count++;
    return count;
  }

  async function runSearch(activeFilters) {
    try {
      setLoading(true);
      setSearched(true);

      // Subcategory-level detail lives on `services`, not `providers` — the
      // filter UI still picks subcategories (activeFilters.categories), so
      // resolving it means finding providers with an active service in any
      // of them first, then filtering providers by that id set.
      let categoryProviderIds = null;
      if (activeFilters.categories.length > 0) {
        const { data: matchingServices, error: svcErr } = await supabase
          .from('services').select('provider_id').in('category', activeFilters.categories).eq('is_active', true);
        if (svcErr) throw svcErr;
        categoryProviderIds = [...new Set((matchingServices || []).map(s => s.provider_id))];
        if (!categoryProviderIds.length) { setResults([]); return; }
      }

      // Fetch providers — no join
      let providerQuery = supabase
        .from('providers')
        .select('*')
        .eq('is_active', true)
        .eq('is_claimed', true) // unclaimed listings have no one to answer bookings — don't surface them to customers
        .eq('is_suspended', false);

      if (categoryProviderIds) {
        providerQuery = providerQuery.in('id', categoryProviderIds);
      }
      if (activeFilters.cities.length > 0) {
        providerQuery = providerQuery.in('city', activeFilters.cities);
      }
      if (activeFilters.minRating > 0) {
        providerQuery = providerQuery.gte('rating', activeFilters.minRating);
      }
      if (activeFilters.verifiedOnly) {
        providerQuery = providerQuery.eq('is_verified', true);
      }
      if (activeFilters.sort === 'rating') {
        providerQuery = providerQuery.order('rating', { ascending: false });
      } else if (activeFilters.sort === 'reviews') {
        providerQuery = providerQuery.order('total_reviews', { ascending: false });
      } else if (activeFilters.sort === 'newest') {
        providerQuery = providerQuery.order('created_at', { ascending: false });
      } else if (activeFilters.sort === 'verified') {
        providerQuery = providerQuery.eq('is_verified', true).order('rating', { ascending: false });
      }

      const { data: providersData, error } = await providerQuery.limit(50);
      if (error) throw error;
      if (!providersData?.length) { setResults([]); return; }

      const providerIds = providersData.map(p => p.id);

      // Fetch ALL services for these providers in ONE query (replaces both the
      // join and the old per-provider event-type loop)
      const { data: servicesData } = await supabase
        .from('services')
        .select('provider_id, price_from, event_types')
        .in('provider_id', providerIds);

      // Fetch related users separately
      const userIds = providersData.map(p => p.user_id).filter(Boolean);
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, avatar_url')
        .in('id', userIds);

      let combined = providersData.map(provider => {
        const providerServices = (servicesData || []).filter(sv => sv.provider_id === provider.id);
        const prices = providerServices.map(sv => sv.price_from || 0).filter(p => p > 0);
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const allEventTypes = providerServices.flatMap(sv => sv.event_types || []);
        return {
          ...provider,
          users: usersData?.find(u => u.id === provider.user_id) || null,
          min_price: minPrice,
          _eventTypes: allEventTypes,
        };
      });

      if (activeFilters.query) {
        const q = activeFilters.query.toLowerCase();
        combined = combined.filter(p =>
          p.users?.name?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.city?.toLowerCase().includes(q) ||
          p.bio?.toLowerCase().includes(q)
        );
      }

      if (activeFilters.budget) {
        combined = combined.filter(p =>
          p.min_price >= activeFilters.budget.min &&
          p.min_price <= activeFilters.budget.max
        );
      }

      if (activeFilters.eventTypes.length > 0) {
        combined = combined.filter(p =>
          activeFilters.eventTypes.some(et => p._eventTypes.includes(et))
        );
      }

      setResults(combined);
    } catch (err) {
      console.log('Search error:', err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleApplyFilters(newFilters) {
    setFilters(newFilters);
    setShowFilters(false);
  }

  function removeFilter(type, value) {
    if (type === 'budget') {
      setFilters(prev => ({ ...prev, budget: null }));
    } else if (type === 'minRating') {
      setFilters(prev => ({ ...prev, minRating: 0 }));
    } else if (type === 'verifiedOnly') {
      setFilters(prev => ({ ...prev, verifiedOnly: false }));
    } else {
      setFilters(prev => ({
        ...prev,
        [type]: prev[type].filter(v => v !== value),
      }));
    }
  }

  const activeTags = [
    ...filters.categories.map(v => ({ type: 'categories', value: v, label: v })),
    ...filters.cities.map(v => ({ type: 'cities', value: v, label: `📍 ${v}` })),
    ...filters.eventTypes.map(v => ({ type: 'eventTypes', value: v, label: v })),
    ...(filters.budget ? [{ type: 'budget', value: filters.budget, label: filters.budget.label }] : []),
    ...(filters.minRating > 0 ? [{ type: 'minRating', value: filters.minRating, label: `${filters.minRating}+ ⭐` }] : []),
    ...(filters.verifiedOnly ? [{ type: 'verifiedOnly', value: true, label: '✓ Verified only' }] : []),
  ];

  return (
    <SafeAreaView style={[s.container, isDesktopWeb && { backgroundColor: CREAM }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <AppHeader title="Search" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <View style={[{ flex: 1 }, isDesktopWeb && ds.centerCol]}>
      {/* Search bar */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Search providers, categories..."
            placeholderTextColor={theme.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[s.filterBtn, activeFilterCount() > 0 && s.filterBtnActive]}
          onPress={() => setShowFilters(true)}
        >
          <Text style={[s.filterBtnText, activeFilterCount() > 0 && s.filterBtnTextActive]}>
            ⊟ {activeFilterCount() > 0 ? activeFilterCount() : 'Filter'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active filter tags */}
      {activeTags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.tagsScroll}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {activeTags.map((tag, i) => (
            <TouchableOpacity
              key={i}
              style={s.activeTag}
              onPress={() => removeFilter(tag.type, tag.value)}
            >
              <Text style={s.activeTagText}>{tag.label}</Text>
              <Text style={s.activeTagClose}> ✕</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={s.clearAllTag}
            onPress={() => setFilters(DEFAULT_FILTERS)}
          >
            <Text style={s.clearAllTagText}>Clear all</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Results */}
      {!searched && query.length === 0 && !hasActiveFilters() ? (
        <View style={s.hintBox}>
          <Text style={s.hintIcon}>🔍</Text>
          <Text style={s.hintTitle}>Search Utsav</Text>
          <Text style={s.hintSub}>
            Search by provider name, category or city — or use filters to narrow down results
          </Text>
          <View style={s.quickSearches}>
            <Text style={s.quickLabel}>Popular searches</Text>
            {['Wedding photographers Delhi', 'Caterers Mumbai', 'DJ Bangalore', 'Mehendi artist'].map(suggestion => (
              <TouchableOpacity
                key={suggestion}
                style={s.suggestion}
                onPress={() => setQuery(suggestion)}
              >
                <Text style={s.suggestionIcon}>🔎</Text>
                <Text style={s.suggestionText}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={s.loadingText}>Searching providers...</Text>
        </View>
      ) : results.length === 0 && searched ? (
        <View style={s.centerBox}>
          <Text style={s.emptyIcon}>😕</Text>
          <Text style={s.emptyTitle}>No providers found</Text>
          <Text style={s.emptySub}>
            Try different keywords or adjust your filters
          </Text>
          <TouchableOpacity
            style={s.clearBtn}
            onPress={() => {
              setQuery('');
              setFilters(DEFAULT_FILTERS);
              setSearched(false);
            }}
          >
            <Text style={s.clearBtnText}>Clear search & filters</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          contentContainerStyle={s.resultsList}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            results.length > 0 ? (
              <Text style={s.resultsCount}>
                {results.length} provider{results.length !== 1 ? 's' : ''} found
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <ProviderResultCard
              provider={item}
              theme={theme}
              onPress={() => navigation.navigate('ProviderProfile', { provider: item, savedPlanId })}
            />
          )}
          ListFooterComponent={<View style={{ height: 140 }} />}
        />
      )}
      </View>

      {/* Filter modal */}
      <FilterModal
        visible={showFilters}
        filters={filters}
        onApply={handleApplyFilters}
        onClose={() => setShowFilters(false)}
        theme={theme}
      />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    screenTitle: { fontSize: 18, fontWeight: '700', color: theme.text },

    searchRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 13, borderWidth: 0.5, borderColor: theme.border },
    searchIcon: { fontSize: 14, marginRight: 6 },
    searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: theme.text },
    searchClear: { fontSize: 14, color: theme.textTertiary, paddingLeft: 6 },
    filterBtn: { backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 11, borderWidth: 0.5, borderColor: theme.border, justifyContent: 'center' },
    filterBtnActive: { backgroundColor: theme.text, borderColor: theme.text },
    filterBtnText: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
    filterBtnTextActive: { color: theme.bg },

    tagsScroll: { flexGrow: 0, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    activeTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.text, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7 },
    activeTagText: { fontSize: 12, color: theme.bg, fontWeight: '600' },
    activeTagClose: { fontSize: 11, color: theme.bg },
    clearAllTag: { backgroundColor: theme.cardBg, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 0.5, borderColor: theme.border },
    clearAllTagText: { fontSize: 12, color: theme.textSecondary, fontWeight: '600' },

    hintBox: { flex: 1, padding: 24 },
    hintIcon: { fontSize: 38, marginBottom: 12, opacity: 0.6 },
    hintTitle: { fontSize: 22, fontWeight: '700', color: theme.text, marginBottom: 6, letterSpacing: -0.3 },
    hintSub: { fontSize: 14, color: theme.textSecondary, lineHeight: 21, marginBottom: 30 },
    quickSearches: { gap: 4 },
    quickLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, marginBottom: 12, letterSpacing: 0.6 },
    suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    suggestionIcon: { fontSize: 14 },
    suggestionText: { fontSize: 14, color: theme.text, fontWeight: '500' },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    loadingText: { marginTop: 12, fontSize: 14, color: theme.textSecondary },
    emptyIcon: { fontSize: 44, marginBottom: 14, opacity: 0.5 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 8 },
    emptySub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 22 },
    clearBtn: { backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 11, borderWidth: 0.5, borderColor: theme.border },
    clearBtnText: { fontSize: 13, color: theme.text, fontWeight: '600' },
    resultsList: { padding: 16 },
    resultsCount: { fontSize: 12, color: theme.textSecondary, marginBottom: 14, fontWeight: '600' },
    resultCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: theme.cardBg, borderRadius: 18, marginBottom: 12,
      borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden',
      shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    },
    resultCardInner: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 15, gap: 13 },
    resultAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    resultAvatarText: { fontSize: 19, color: '#FFF', fontWeight: '700' },
    resultInfo: { flex: 1 },
    resultNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    resultName: { fontSize: 14.5, fontWeight: '700', color: theme.text },
    verifiedBadge: { backgroundColor: theme.bgSecondary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    verifiedText: { fontSize: 10, color: theme.text, fontWeight: '700' },
    resultMeta: { fontSize: 12, color: theme.textSecondary, marginBottom: 4 },
    resultRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
    resultStars: { fontSize: 11 },
    resultRating: { fontSize: 12, fontWeight: '700', color: theme.text },
    resultReviews: { fontSize: 11, color: theme.textSecondary },
    resultPrice: { fontSize: 12, color: theme.accent, fontWeight: '700', marginTop: 2 },
    heartBtn: { padding: 16 },
    heartIcon: { fontSize: 19, color: theme.textSecondary },
    heartIconSaved: { color: '#E85D04' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: theme.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    modalClose: { fontSize: 18, color: theme.textSecondary, width: 32 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    modalReset: { fontSize: 14, color: theme.accent, fontWeight: '700' },
    modalFooter: { padding: 16, borderTopWidth: 0.5, borderTopColor: theme.border },
    applyBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
    applyBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },

    filterSection: { padding: 18, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    filterSectionTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 13 },
    filterSectionHint: { fontSize: 11.5, color: theme.textTertiary, marginTop: -8, marginBottom: 11 },
    filterCount: { fontSize: 13, color: theme.accent, fontWeight: '600' },
    subcategoryBlock: { marginTop: 14, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: theme.border },
    subcategoryLabel: { fontSize: 11.5, fontWeight: '700', color: theme.textTertiary, marginBottom: 9, textTransform: 'uppercase', letterSpacing: 0.4 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg },
    chipActive: { backgroundColor: theme.text, borderColor: theme.text },
    chipText: { fontSize: 13, color: theme.textSecondary },
    chipTextActive: { color: theme.bg, fontWeight: '600' },
    toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    toggleLabel: { fontSize: 14, color: theme.text, fontWeight: '600' },
    toggleSub: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: theme.border, justifyContent: 'center', paddingHorizontal: 2 },
    toggleActive: { backgroundColor: theme.text },
    toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.bg },
    toggleThumbActive: { transform: [{ translateX: 20 }] },
  });
}

const ds = StyleSheet.create({
  centerCol: { width: '100%', maxWidth: 900, alignSelf: 'center' },
});