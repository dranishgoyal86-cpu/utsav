import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { confirmAction } from '../../helpers';
import SwipeableRow from '../../components/SwipeableRow';
import { ArrowCounterClockwise } from 'phosphor-react-native';
import AppHeader from '../../components/AppHeader';
import DesktopStandalonePage from '../../components/desktop/DesktopStandalonePage';
import { MAROON, CARD, LINE, TEXT, MUTED, UNDO, UNDO_BG, UNDO_BORDER } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

export default function BlockedProviders({ navigation }) {
  const { theme } = useTheme();
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  useFocusEffect(
    useCallback(() => { fetchBlocked(); }, [])
  );

  async function fetchBlocked() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch blocked_providers rows — no join
      const { data: blockedData, error } = await supabase
        .from('blocked_providers')
        .select('*')
        .eq('customer_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!blockedData?.length) { setBlocked([]); return; }

      // Fetch related providers separately
      const providerIds = blockedData.map(b => b.provider_id).filter(Boolean);
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
      const merged = blockedData.map(item => {
        const provider = providersData?.find(p => p.id === item.provider_id) || null;
        return {
          ...item,
          providers: provider
            ? { ...provider, users: usersData?.find(u => u.id === provider.user_id) || null }
            : null,
        };
      });

      setBlocked(merged);
    } catch (err) {
      console.log('Fetch blocked error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleUnblock(blockedId, providerName) {
    confirmAction(
      'Undo block?',
      `Start recommending ${providerName} again?`,
      'Undo',
      async () => {
        await supabase.from('blocked_providers').delete().eq('id', blockedId);
        setBlocked(prev => prev.filter(b => b.id !== blockedId));
      }
    );
  }

  if (isDesktopWeb) {
    return (
      <DesktopStandalonePage onBack={() => navigation.goBack()} title="Blocked vendors" maxWidth={900}>
        {loading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color={MAROON} /></View>
        ) : blocked.length === 0 ? (
          <View style={ds.emptyCard}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🚫</Text>
            <Text style={ds.emptyTitle}>No blocked vendors</Text>
            <Text style={ds.emptySub}>Vendors you mark "Not interested" on their profile stop showing up in your event agent's recommendations — you'll see them here.</Text>
          </View>
        ) : (
          <>
            <View style={ds.grid}>
              {blocked.map(item => {
                const provider = item.providers;
                const name = provider?.users?.name || 'Provider';
                return (
                  <View key={item.id} style={ds.card}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate('ProviderProfile', { provider })} activeOpacity={0.85}>
                      <View style={ds.avatar}><Text style={ds.avatarText}>{name[0]}</Text></View>
                      <Text style={ds.name}>{name}</Text>
                      <Text style={ds.meta}>{provider?.category} · {provider?.city}</Text>
                      <View style={ds.ratingRow}>
                        <Text style={{ fontSize: 12 }}>⭐</Text>
                        <Text style={ds.rating}>{provider?.rating?.toFixed(1) || 'New'}</Text>
                        <Text style={ds.reviews}>({provider?.total_reviews || 0})</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={ds.undoBtn} onPress={() => handleUnblock(item.id, name)}>
                      <ArrowCounterClockwise size={13} color={UNDO} />
                      <Text style={ds.undoBtnText}>Undo</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
            <Text style={ds.footerText}>{blocked.length} blocked vendor{blocked.length !== 1 ? 's' : ''}</Text>
          </>
        )}
      </DesktopStandalonePage>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Blocked vendors" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : blocked.length === 0 ? (
        <View style={s.centerBox}>
          <Text style={s.emptyIcon}>🚫</Text>
          <Text style={s.emptyTitle}>No blocked vendors</Text>
          <Text style={s.emptySub}>
            Vendors you mark "Not interested" on their profile stop showing up in your event agent's recommendations — you'll see them here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => {
            const provider = item.providers;
            const name = provider?.users?.name || 'Provider';
            return (
              <SwipeableRow
                style={s.providerCardWrap}
                onPress={() => navigation.navigate('ProviderProfile', { provider })}
                onDelete={() => handleUnblock(item.id, name)}
                deleteLabel="Undo"
                actionColor="#3B82F6"
                actionIcon={ArrowCounterClockwise}
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
                      </View>
                    </View>
                  </View>
                </View>
              </SwipeableRow>
            );
          }}
          ListFooterComponent={
            <Text style={s.footerText}>
              {blocked.length} blocked vendor{blocked.length !== 1 ? 's' : ''}
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
    footerText: { textAlign: 'center', fontSize: 12, color: theme.textTertiary, marginTop: 8, paddingBottom: 12 },
  });
}

const ds = StyleSheet.create({
  emptyCard: { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: LINE, padding: 44, alignItems: 'center' },
  emptyTitle: { fontFamily: 'Fraunces-SemiBold', fontSize: 17, color: TEXT, marginBottom: 8 },
  emptySub: { fontSize: 13.5, color: MUTED, textAlign: 'center', lineHeight: 20, maxWidth: 360 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { width: 280, backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: MAROON, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { fontSize: 16, color: '#fff', fontWeight: '700' },
  name: { fontFamily: 'Fraunces-SemiBold', fontSize: 15, color: TEXT, marginBottom: 3 },
  meta: { fontSize: 12, color: MUTED, marginBottom: 8 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  rating: { fontSize: 12, fontWeight: '700', color: TEXT },
  reviews: { fontSize: 11, color: MUTED },
  undoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: UNDO_BG, borderWidth: 1, borderColor: UNDO_BORDER },
  undoBtnText: { fontSize: 12.5, color: UNDO, fontWeight: '700' },
  footerText: { textAlign: 'center', fontSize: 12, color: MUTED, marginTop: 20 },
});
