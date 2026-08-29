import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { confirmDestructive } from '../../helpers';
import SwipeableRow from '../../components/SwipeableRow';
import AppHeader from '../../components/AppHeader';
import DesktopStandalonePage from '../../components/desktop/DesktopStandalonePage';
import { MAROON, CARD, LINE, TEXT, MUTED, CREAM } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

export default function SavedProviders({ navigation }) {
  const { theme } = useTheme();
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  useFocusEffect(
    useCallback(() => { fetchSaved(); }, [])
  );

  async function fetchSaved() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch saved_providers rows — no join
      const { data: savedData, error } = await supabase
        .from('saved_providers')
        .select('*')
        .eq('customer_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!savedData?.length) { setSaved([]); return; }

      // Fetch related providers separately
      const providerIds = savedData.map(s => s.provider_id).filter(Boolean);
      const { data: providersData } = await supabase
        .from('providers')
        .select('id, category, city, rating, total_reviews, is_verified, user_id')
        .in('id', providerIds);

      // Fetch related users separately
      const userIds = (providersData || []).map(p => p.user_id).filter(Boolean);
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, avatar_url')
        .in('id', userIds);

      // Manually join in JS
      const merged = savedData.map(item => {
        const provider = providersData?.find(p => p.id === item.provider_id) || null;
        return {
          ...item,
          providers: provider
            ? { ...provider, users: usersData?.find(u => u.id === provider.user_id) || null }
            : null,
        };
      });

      setSaved(merged);
    } catch (err) {
      console.log('Fetch saved error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleUnsave(savedId, providerName) {
    confirmDestructive(
      'Remove from saved?',
      `Remove ${providerName} from your saved providers?`,
      'Remove',
      async () => {
        await supabase.from('saved_providers').delete().eq('id', savedId);
        setSaved(prev => prev.filter(s => s.id !== savedId));
      }
    );
  }

  if (isDesktopWeb) {
    return (
      <DesktopStandalonePage onBack={() => navigation.goBack()} title="Saved providers" maxWidth={900}>
        {loading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color={MAROON} /></View>
        ) : saved.length === 0 ? (
          <View style={ds.emptyCard}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🤍</Text>
            <Text style={ds.emptyTitle}>No saved providers yet</Text>
            <Text style={ds.emptySub}>Tap the ♡ heart on any provider card to save them for later</Text>
            <TouchableOpacity style={ds.browseBtn} onPress={() => navigation.goBack()}>
              <Text style={ds.browseBtnText}>Browse providers →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={ds.grid}>
              {saved.map(item => {
                const provider = item.providers;
                const name = provider?.users?.name || 'Provider';
                return (
                  <View key={item.id} style={ds.card}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate('ProviderProfile', { provider })} activeOpacity={0.85}>
                      <View style={ds.cardTop}>
                        <View style={ds.avatar}><Text style={ds.avatarText}>{name[0]}</Text></View>
                        <View style={ds.heartBtn}><Text style={{ fontSize: 15, color: '#E85D04' }}>♥</Text></View>
                      </View>
                      <Text style={ds.name}>{name}</Text>
                      <Text style={ds.meta}>{provider?.category} · {provider?.city}</Text>
                      <View style={ds.ratingRow}>
                        <Text style={{ fontSize: 12 }}>⭐</Text>
                        <Text style={ds.rating}>{provider?.rating?.toFixed(1) || 'New'}</Text>
                        <Text style={ds.reviews}>({provider?.total_reviews || 0})</Text>
                        {provider?.is_verified && <View style={ds.verifiedBadge}><Text style={ds.verifiedText}>✓</Text></View>}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={ds.unsaveBtn} onPress={() => handleUnsave(item.id, name)}>
                      <Text style={ds.unsaveBtnText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
            <Text style={ds.footerText}>{saved.length} saved provider{saved.length !== 1 ? 's' : ''}</Text>
          </>
        )}
      </DesktopStandalonePage>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Saved providers" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : saved.length === 0 ? (
        <View style={s.centerBox}>
          <Text style={s.emptyIcon}>🤍</Text>
          <Text style={s.emptyTitle}>No saved providers yet</Text>
          <Text style={s.emptySub}>
            Tap the ♡ heart on any provider card to save them for later
          </Text>
          <TouchableOpacity
            style={s.browseBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={s.browseBtnText}>Browse providers →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={saved}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => {
            const provider = item.providers;
            const name = provider?.users?.name || 'Provider';
            return (
              <SwipeableRow
                style={s.providerCardWrap}
                onPress={() => navigation.navigate('ProviderProfile', { provider })}
                onDelete={() => handleUnsave(item.id, name)}
              >
                <View style={s.providerCard}>
                  <View style={s.cardLeft}>
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>{name[0]}</Text>
                    </View>
                    <View style={s.info}>
                      <Text style={s.name}>{name}</Text>
                      <Text style={s.meta}>
                        {provider?.category} · {provider?.city}
                      </Text>
                      <View style={s.ratingRow}>
                        <Text style={s.star}>⭐</Text>
                        <Text style={s.rating}>
                          {provider?.rating?.toFixed(1) || 'New'}
                        </Text>
                        <Text style={s.reviews}>
                          ({provider?.total_reviews || 0} reviews)
                        </Text>
                        {provider?.is_verified && (
                          <View style={s.verifiedBadge}>
                            <Text style={s.verifiedText}>✓</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                  <View style={s.cardRight}>
                    <View style={s.heartBtn}>
                      <Text style={s.heartFilled}>♥</Text>
                    </View>
                  </View>
                </View>
              </SwipeableRow>
            );
          }}
          ListFooterComponent={
            <Text style={s.footerText}>
              {saved.length} saved provider{saved.length !== 1 ? 's' : ''}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyIcon: { fontSize: 52, marginBottom: 16, opacity: 0.6 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 8 },
    emptySub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 26 },
    browseBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13 },
    browseBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    list: { padding: 16, paddingBottom: 140 },
    providerCardWrap: { borderRadius: 20, marginBottom: 12 },
    providerCard: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: theme.cardBg, borderRadius: 20, padding: 16,
      borderWidth: 0.5, borderColor: theme.border,
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
    cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 13, flex: 1 },
    avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    avatarText: { fontSize: 19, color: '#FFF', fontWeight: '700' },
    info: { flex: 1 },
    name: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 2 },
    meta: { fontSize: 12.5, color: theme.textSecondary, marginBottom: 5 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    star: { fontSize: 11 },
    rating: { fontSize: 12, fontWeight: '700', color: theme.text },
    reviews: { fontSize: 11, color: theme.textSecondary },
    verifiedBadge: { backgroundColor: theme.bgSecondary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    verifiedText: { fontSize: 10, color: theme.text, fontWeight: '700' },
    cardRight: { alignItems: 'center', gap: 8, marginLeft: 8 },
    heartBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFF0EC', alignItems: 'center', justifyContent: 'center' },
    heartFilled: { fontSize: 17, color: '#E85D04' },
    footerText: { textAlign: 'center', fontSize: 12, color: theme.textTertiary, marginTop: 8, paddingBottom: 12 },
  });
}

const ds = StyleSheet.create({
  emptyCard: { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: LINE, padding: 44, alignItems: 'center' },
  emptyTitle: { fontFamily: 'Fraunces-SemiBold', fontSize: 17, color: TEXT, marginBottom: 8 },
  emptySub: { fontSize: 13.5, color: MUTED, textAlign: 'center', lineHeight: 20, marginBottom: 20, maxWidth: 320 },
  browseBtn: { backgroundColor: MAROON, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  browseBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { width: 280, backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: MAROON, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, color: '#fff', fontWeight: '700' },
  heartBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: 'Fraunces-SemiBold', fontSize: 15, color: TEXT, marginBottom: 3 },
  meta: { fontSize: 12, color: MUTED, marginBottom: 8 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  rating: { fontSize: 12, fontWeight: '700', color: TEXT },
  reviews: { fontSize: 11, color: MUTED },
  verifiedBadge: { backgroundColor: CREAM, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 2 },
  verifiedText: { fontSize: 10, color: TEXT, fontWeight: '700' },
  unsaveBtn: { paddingVertical: 10, borderRadius: 12, backgroundColor: CREAM, borderWidth: 1, borderColor: LINE, alignItems: 'center' },
  unsaveBtnText: { fontSize: 12.5, color: MUTED, fontWeight: '600' },
  footerText: { textAlign: 'center', fontSize: 12, color: MUTED, marginTop: 20 },
});