import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { useSavedProvider } from '../../hooks/useSavedProvider';
import { getSubcategories, getCategoryIcon } from '../../serviceTemplates';
import AppHeader from '../../components/AppHeader';

function ProviderCard({ provider, onPress, theme }) {
  const { isSaved, loading: saveLoading, toggleSave } = useSavedProvider(provider.id);
  const s = makeStyles(theme);

  return (
    <View style={s.providerCard}>
      <TouchableOpacity style={s.providerCardInner} onPress={onPress} activeOpacity={0.7}>
        <View style={s.providerAvatar}>
          <Text style={s.providerAvatarText}>{provider.users?.name?.[0] || '?'}</Text>
        </View>
        <View style={s.providerInfo}>
          <Text style={s.providerName}>{provider.users?.name}</Text>
          <Text style={s.providerMeta}>{provider.category} · {provider.city}</Text>
          <View style={s.ratingRow}>
            <Text style={s.star}>⭐</Text>
            <Text style={s.rating}>{provider.rating?.toFixed(1) || 'New'}</Text>
            <Text style={s.reviews}>({provider.total_reviews || 0} reviews)</Text>
            {provider.is_verified && (
              <View style={s.verifiedBadge}>
                <Text style={s.verifiedText}>✓ Verified</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
      <View style={s.cardActions}>
        <TouchableOpacity style={s.heartBtn} onPress={toggleSave} disabled={saveLoading}>
          <Text style={[s.heartIcon, isSaved && s.heartIconSaved]}>{isSaved ? '♥' : '♡'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.bookBtn} onPress={onPress}>
          <Text style={s.bookBtnText}>View</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CategoryList({ navigation, route }) {
  const { category, city, eventType } = route.params || {};
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const subcategories = getSubcategories(category);

  const [selectedSub, setSelectedSub] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProviders();
  }, [selectedSub]);

  async function fetchProviders() {
    try {
      setLoading(true);

      let providersData;
      if (selectedSub) {
        // Subcategory-level detail lives on `services`, not `providers`, so
        // narrowing to one specific subcategory means finding providers who
        // have an active service in it — a real two-query pivot, not a
        // single filter on providers.category.
        const { data: matchingServices, error: svcErr } = await supabase
          .from('services').select('provider_id').eq('category', selectedSub).eq('is_active', true);
        if (svcErr) throw svcErr;
        const providerIds = [...new Set((matchingServices || []).map(s => s.provider_id))];
        if (!providerIds.length) { setProviders([]); return; }

        let query = supabase.from('providers').select('*')
          .eq('is_active', true).eq('is_suspended', false).in('id', providerIds);
        if (city) query = query.eq('city', city);
        const { data, error } = await query.limit(50);
        if (error) throw error;
        providersData = data;
      } else {
        // "All" — matches providers.category however it's stored: the
        // parent itself (new-format) or one of its subcategories
        // (old-format — no bulk historical migration was done).
        let query = supabase.from('providers').select('*')
          .eq('is_active', true).eq('is_suspended', false)
          .in('category', [category, ...subcategories]);
        if (city) query = query.eq('city', city);
        const { data, error } = await query.limit(50);
        if (error) throw error;
        providersData = data;
      }

      if (!providersData?.length) {
        setProviders([]);
        return;
      }

      const userIds = providersData.map(p => p.user_id).filter(Boolean);
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, avatar_url')
        .in('id', userIds);

      setProviders(providersData.map(provider => ({
        ...provider,
        users: usersData?.find(u => u.id === provider.user_id) || null,
      })));
    } catch (err) {
      console.log('CategoryList fetch error:', err.message);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title={`${getCategoryIcon(category)} ${category}`} onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.subScroll}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        <TouchableOpacity
          style={[s.subChip, selectedSub === null && s.subChipActive]}
          onPress={() => setSelectedSub(null)}
        >
          <Text style={[s.subChipText, selectedSub === null && s.subChipTextActive]}>All</Text>
        </TouchableOpacity>
        {subcategories.map(sub => (
          <TouchableOpacity
            key={sub}
            style={[s.subChip, selectedSub === sub && s.subChipActive]}
            onPress={() => setSelectedSub(sub === selectedSub ? null : sub)}
          >
            <Text style={[s.subChipText, selectedSub === sub && s.subChipTextActive]}>{sub}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 8 }}>
        {loading ? (
          <View style={s.centerBox}>
            <ActivityIndicator color={theme.accent} />
            <Text style={s.loadingText}>Finding providers...</Text>
          </View>
        ) : providers.length === 0 ? (
          <View style={s.centerBox}>
            <Text style={s.emptyIcon}>🔍</Text>
            <Text style={s.emptyTitle}>
              No providers found{city ? ` in ${city}` : ''}
            </Text>
            <Text style={s.emptySub}>Check back soon as more providers join!</Text>
          </View>
        ) : (
          <>
            <Text style={s.resultsCount}>
              {providers.length} provider{providers.length !== 1 ? 's' : ''} found
            </Text>
            {providers.map(provider => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                theme={theme}
                onPress={() => navigation.navigate('ProviderProfile', { provider })}
              />
            ))}
          </>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text },

    subScroll: { flexGrow: 0, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    subChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg, marginRight: 8 },
    subChipActive: { backgroundColor: theme.text, borderColor: theme.text },
    subChipText: { fontSize: 13, color: theme.textSecondary },
    subChipTextActive: { color: theme.bg, fontWeight: '600' },

    resultsCount: { fontSize: 12, color: theme.textSecondary, marginBottom: 14, fontWeight: '600', paddingHorizontal: 16 },

    centerBox: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
    loadingText: { marginTop: 10, fontSize: 13, color: theme.textSecondary },
    emptyIcon: { fontSize: 40, marginBottom: 12, opacity: 0.5 },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 6, textAlign: 'center' },
    emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

    providerCard: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: 16, marginBottom: 12,
      backgroundColor: theme.cardBg, borderRadius: 18,
      borderWidth: 0.5, borderColor: theme.border,
      shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    },
    providerCardInner: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 15, gap: 13 },
    providerAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    providerAvatarText: { fontSize: 19, color: '#FFF', fontWeight: '700' },
    providerInfo: { flex: 1 },
    providerName: { fontSize: 14.5, fontWeight: '700', color: theme.text, marginBottom: 2 },
    providerMeta: { fontSize: 12, color: theme.textSecondary, marginBottom: 4 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    star: { fontSize: 11 },
    rating: { fontSize: 12, fontWeight: '700', color: theme.text },
    reviews: { fontSize: 11, color: theme.textSecondary },
    verifiedBadge: { backgroundColor: theme.bgSecondary, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2.5, marginLeft: 2 },
    verifiedText: { fontSize: 10, color: theme.text, fontWeight: '700' },
    cardActions: { alignItems: 'center', gap: 8, paddingRight: 14, paddingVertical: 15 },
    heartBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.bgSecondary, alignItems: 'center', justifyContent: 'center' },
    heartIcon: { fontSize: 15, color: theme.textSecondary },
    heartIconSaved: { color: '#E85D04' },
    bookBtn: { backgroundColor: theme.btnPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
    bookBtnText: { color: theme.btnPrimaryText, fontSize: 11.5, fontWeight: '700' },
  });
}
