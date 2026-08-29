import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import AppHeader from '../../components/AppHeader';
import DesktopStandalonePage from '../../components/desktop/DesktopStandalonePage';
import { MAROON, GOLD, CARD, LINE, TEXT, MUTED, CREAM } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

function StarBar({ rating, count, total, theme }) {
  const width = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <Text style={{ fontSize: 12, color: theme.textSecondary, width: 8 }}>{rating}</Text>
      <Text style={{ fontSize: 10, color: theme.accent }}>★</Text>
      <View style={{ flex: 1, height: 6, backgroundColor: theme.bgSecondary, borderRadius: 3, overflow: 'hidden' }}>
        <View style={{ width: `${width}%`, height: 6, backgroundColor: theme.accent, borderRadius: 3 }} />
      </View>
      <Text style={{ fontSize: 11, color: theme.textSecondary, width: 24 }}>{count}</Text>
    </View>
  );
}

export default function ProviderReviews({ route, navigation }) {
  const { providerId, providerName } = route.params;
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ avg: 0, total: 0, breakdown: {} });
  const s = makeStyles(theme);

  useEffect(() => { fetchReviews(); }, []);

  async function fetchReviews() {
    try {
      setLoading(true);

      // Fetch reviews — no join
      const { data: reviewsData, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const allReviewsRaw = reviewsData || [];

      // Fetch related reviewer names separately
      let allReviews = allReviewsRaw;
      if (allReviewsRaw.length > 0) {
        const reviewerIds = [...new Set(allReviewsRaw.map(r => r.customer_id).filter(Boolean))];
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name')
          .in('id', reviewerIds);

        // Fetch the booking each review traces back to, separately — every
        // review already requires a real completed booking to be written
        // (see BookingsScreen.js), this just surfaces that proof to browsers.
        const bookingIds = [...new Set(allReviewsRaw.map(r => r.booking_id).filter(Boolean))];
        const { data: bookingsData } = bookingIds.length
          ? await supabase.from('bookings').select('id, event_type, event_date').in('id', bookingIds)
          : { data: [] };

        allReviews = allReviewsRaw.map(r => ({
          ...r,
          users: usersData?.find(u => u.id === r.customer_id) || null,
          booking: bookingsData?.find(b => b.id === r.booking_id) || null,
        }));
      }

      setReviews(allReviews);

      if (allReviews.length > 0) {
        const avg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
        const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        allReviews.forEach(r => { breakdown[r.rating] = (breakdown[r.rating] || 0) + 1; });
        setStats({ avg: avg.toFixed(1), total: allReviews.length, breakdown });
      }
    } catch (err) {
      console.log(err.message);
    } finally {
      setLoading(false);
    }
  }

  function renderStars(rating) {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  }

  if (isDesktopWeb) {
    return (
      <DesktopStandalonePage onBack={() => navigation.goBack()} title={`Reviews · ${providerName}`} maxWidth={900}>
        {loading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color={MAROON} /></View>
        ) : (
          <>
            {stats.total > 0 && (
              <View style={ds.summaryCard}>
                <View style={ds.summaryLeft}>
                  <Text style={ds.avgRating}>{stats.avg}</Text>
                  <Text style={ds.avgStars}>{'★'.repeat(Math.round(stats.avg))}{'☆'.repeat(5 - Math.round(stats.avg))}</Text>
                  <Text style={ds.totalReviews}>{stats.total} reviews</Text>
                </View>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  {[5, 4, 3, 2, 1].map(star => (
                    <StarBar key={star} rating={star} count={stats.breakdown[star] || 0} total={stats.total} theme={{ textSecondary: MUTED, bgSecondary: CREAM, accent: GOLD }} />
                  ))}
                </View>
              </View>
            )}

            {reviews.length === 0 ? (
              <View style={ds.emptyCard}>
                <Text style={{ fontSize: 30, marginBottom: 10 }}>⭐</Text>
                <Text style={ds.emptyTitle}>No reviews yet</Text>
                <Text style={ds.emptySub}>Be the first to review after booking</Text>
              </View>
            ) : (
              <View style={ds.grid}>
                {reviews.map(review => (
                  <View key={review.id} style={ds.reviewCard}>
                    <View style={ds.reviewTop}>
                      <View style={ds.reviewAvatar}><Text style={ds.reviewAvatarText}>{review.users?.name?.[0] || '?'}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={ds.reviewerName}>{review.users?.name || 'Customer'}</Text>
                        <Text style={ds.reviewDate}>{new Date(review.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
                      </View>
                      <Text style={ds.reviewStars}>{renderStars(review.rating)}</Text>
                    </View>
                    {review.booking && (
                      <Text style={ds.verifiedText}>✓ Verified booking · {review.booking.event_type}{review.booking.event_date ? ` · ${new Date(review.booking.event_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}</Text>
                    )}
                    {review.comment && <Text style={ds.reviewComment}>{review.comment}</Text>}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </DesktopStandalonePage>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title={`Reviews · ${providerName}`} onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>

          {/* Rating summary */}
          {stats.total > 0 && (
            <View style={s.summaryCard}>
              <View style={s.summaryLeft}>
                <Text style={s.avgRating}>{stats.avg}</Text>
                <Text style={s.avgStars}>{'★'.repeat(Math.round(stats.avg))}{'☆'.repeat(5 - Math.round(stats.avg))}</Text>
                <Text style={s.totalReviews}>{stats.total} reviews</Text>
              </View>
              <View style={s.summaryRight}>
                {[5, 4, 3, 2, 1].map(star => (
                  <StarBar
                    key={star}
                    rating={star}
                    count={stats.breakdown[star] || 0}
                    total={stats.total}
                    theme={theme}
                  />
                ))}
              </View>
            </View>
          )}

          {reviews.length === 0 ? (
            <View style={s.centerBox}>
              <Text style={s.emptyIcon}>⭐</Text>
              <Text style={s.emptyTitle}>No reviews yet</Text>
              <Text style={s.emptySub}>Be the first to review after booking</Text>
            </View>
          ) : (
            reviews.map(review => (
              <View key={review.id} style={s.reviewCard}>
                <View style={s.reviewTop}>
                  <View style={s.reviewAvatar}>
                    <Text style={s.reviewAvatarText}>
                      {review.users?.name?.[0] || '?'}
                    </Text>
                  </View>
                  <View style={s.reviewMeta}>
                    <Text style={s.reviewerName}>{review.users?.name || 'Customer'}</Text>
                    <Text style={s.reviewDate}>
                      {new Date(review.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'long', year: 'numeric'
                      })}
                    </Text>
                  </View>
                  <Text style={s.reviewStars}>
                    {renderStars(review.rating)}
                  </Text>
                </View>
                {review.booking && (
                  <View style={s.verifiedRow}>
                    <Text style={s.verifiedText}>
                      ✓ Verified booking · {review.booking.event_type}
                      {review.booking.event_date ? ` · ${new Date(review.booking.event_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}
                    </Text>
                  </View>
                )}
                {review.comment && (
                  <Text style={s.reviewComment}>{review.comment}</Text>
                )}
              </View>
            ))
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text, flex: 1, textAlign: 'center' },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, paddingTop: 48 },
    emptyIcon: { fontSize: 38, marginBottom: 14, opacity: 0.5 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 },
    emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center' },

    summaryCard: {
      flexDirection: 'row', margin: 16, padding: 18,
      backgroundColor: theme.cardBg, borderRadius: 20,
      borderWidth: 0.5, borderColor: theme.border, gap: 18,
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
    summaryLeft: { alignItems: 'center', justifyContent: 'center', minWidth: 80 },
    avgRating: { fontSize: 42, fontWeight: '700', color: theme.text, lineHeight: 46, letterSpacing: -0.5 },
    avgStars: { fontSize: 15, color: theme.accent, marginBottom: 4 },
    totalReviews: { fontSize: 12, color: theme.textSecondary },
    summaryRight: { flex: 1, justifyContent: 'center' },

    reviewCard: { marginHorizontal: 16, marginBottom: 11, padding: 15, backgroundColor: theme.cardBg, borderRadius: 17, borderWidth: 0.5, borderColor: theme.border },
    reviewTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
    reviewAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    reviewAvatarText: { fontSize: 14, color: '#FFF', fontWeight: '700' },
    reviewMeta: { flex: 1 },
    reviewerName: { fontSize: 13.5, fontWeight: '700', color: theme.text },
    reviewDate: { fontSize: 11, color: theme.textSecondary },
    reviewStars: { fontSize: 14, color: theme.accent },
    verifiedRow: { marginBottom: 8 },
    verifiedText: { fontSize: 11, fontWeight: '700', color: '#2E7D32' },
    reviewComment: { fontSize: 13, color: theme.textSecondary, lineHeight: 20 },
  });
}

const ds = StyleSheet.create({
  summaryCard: { flexDirection: 'row', padding: 20, backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: LINE, gap: 20, marginBottom: 20 },
  summaryLeft: { alignItems: 'center', justifyContent: 'center', minWidth: 90 },
  avgRating: { fontFamily: 'Fraunces-SemiBold', fontSize: 42, color: TEXT, lineHeight: 46 },
  avgStars: { fontSize: 15, color: GOLD, marginBottom: 4 },
  totalReviews: { fontSize: 12, color: MUTED },
  emptyCard: { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: LINE, padding: 44, alignItems: 'center' },
  emptyTitle: { fontFamily: 'Fraunces-SemiBold', fontSize: 16, color: TEXT, marginBottom: 6 },
  emptySub: { fontSize: 13, color: MUTED },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  reviewCard: { width: 420, padding: 16, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: LINE },
  reviewTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  reviewAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: MAROON, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  reviewerName: { fontSize: 13.5, fontWeight: '700', color: TEXT },
  reviewDate: { fontSize: 11, color: MUTED },
  reviewStars: { fontSize: 14, color: GOLD },
  verifiedText: { fontSize: 11, fontWeight: '700', color: '#2E7D32', marginBottom: 8 },
  reviewComment: { fontSize: 13, color: MUTED, lineHeight: 20 },
});