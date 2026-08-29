import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import { resolveMatchKey } from '../../vendorTaxonomy';
import { eventTypeName } from '../../lib/eventTypeNames';
import { getAvoidProviderIds } from '../../customerMemory';
import AppHeader from '../../components/AppHeader';
import DesktopStandalonePage from '../../components/desktop/DesktopStandalonePage';
import { MAROON, CARD, LINE, TEXT, MUTED } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

export default function ItemDetail({ route, navigation }) {
  const { eventId, itemName, categorySlug, contextualLabel, basis, priceLow, priceHigh, quoteOnRequest } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [event, setEvent] = useState(null);
  const [savedPlanId, setSavedPlanId] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [arranging, setArranging] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [alreadyArranged, setAlreadyArranged] = useState(false);

  useEffect(() => { fetchData(); }, [eventId, categorySlug]);

  async function fetchData() {
    try {
      setLoading(true);
      const { data: eventData, error: eventError } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (eventError) throw eventError;
      setEvent(eventData);
      setAlreadyArranged((eventData.arranged_categories || []).includes(categorySlug));

      // Booking (CreateBookingScreen.js) prefills from the event via
      // saved_plans.id, not eventId directly — bookings.saved_plan_id is
      // what actually links a booking back to a plan. Resolved here, once,
      // so tapping a provider row carries it forward instead of silently
      // dropping the event context between here and the booking screen
      // (which is what happened before this — ProviderProfile.js only got
      // a bare providerId).
      const { data: linkedPlan } = await supabase.from('saved_plans').select('id').eq('event_id', eventId).maybeSingle();
      setSavedPlanId(linkedPlan?.id || null);

      // services has no category_slug — and no city — of its own. category
      // is qualified via the same helper the plan engine itself uses
      // (vendorTaxonomy.js's resolveMatchKey); city lives on the provider,
      // not the service (confirmed against the live schema — services has
      // no city column at all), so the city filter has to happen on the
      // providers query below, not here.
      const { data: activeServices, error: servicesError } = await supabase
        .from('services')
        .select('id, provider_id, category')
        .eq('is_active', true);
      if (servicesError) throw servicesError;

      // Ported from the old EventPlanner.js flow, which never let a
      // provider the customer rated ≤2 stars or explicitly blocked show up
      // in "Recommended providers" — this list had no equivalent here at
      // all. Avoid-list is the viewer's own (whoever's looking at this
      // screen), not the event host's, matching getAvoidProviderIds' own
      // per-customer contract.
      const { data: { session } } = await supabase.auth.getSession();
      const avoidProviderIds = session ? await getAvoidProviderIds(session.user.id) : [];

      const matchingProviderIds = [...new Set(
        (activeServices || [])
          .filter(sv => resolveMatchKey(sv.category) === categorySlug)
          .map(sv => sv.provider_id)
          .filter(Boolean)
      )].filter(id => !avoidProviderIds.includes(id));

      if (matchingProviderIds.length > 0) {
        let providerQuery = supabase
          .from('providers')
          .select('id, name, business_name, city, rating, logo_url')
          .in('id', matchingProviderIds);
        if (eventData.city) providerQuery = providerQuery.eq('city', eventData.city);
        const { data: providerRows, error: providersError } = await providerQuery;
        if (providersError) throw providersError;
        setProviders(providerRows || []);
      } else {
        setProviders([]);
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function markArranged() {
    if (alreadyArranged) return;
    setArranging(true);
    try {
      const updated = [...(event.arranged_categories || []), categorySlug];
      const { error } = await supabase.from('events').update({ arranged_categories: updated }).eq('id', eventId);
      if (error) throw error;
      setEvent(prev => ({ ...prev, arranged_categories: updated }));
      setAlreadyArranged(true);
      showAlert('Marked as arranged ✓', `${itemName} now counts as handled on your plan.`);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setArranging(false);
    }
  }

  async function notifyMe() {
    setNotifying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showAlert('Not signed in', 'Please log in first.'); return; }

      const { data: existing, error: findError } = await supabase
        .from('category_interest')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('event_id', eventId)
        .eq('category', categorySlug)
        .maybeSingle();
      if (findError) throw findError;

      if (!existing) {
        const { error } = await supabase.from('category_interest').insert({
          user_id: session.user.id,
          event_id: eventId,
          category: categorySlug,
          city: event?.city || null,
          event_type_slug: event?.event_type_slug || null,
        });
        if (error) throw error;
      }
      showAlert("You're on the list", `We'll let you know when a new ${itemName.toLowerCase()} vendor lists here.`);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setNotifying(false);
    }
  }

  function findVendor() {
    // savedPlanId (resolved in fetchData, same value the recommended-
    // providers list below already forwards) was missing here — anyone who
    // used "Find a vendor" instead of tapping a recommended provider lost
    // event-plan context the moment they left this screen, so their
    // eventual booking never autofilled.
    navigation.navigate('Search', { presetCategory: categorySlug, presetCity: event?.city, savedPlanId });
  }

  const label = contextualLabel || itemName;
  const priceText = quoteOnRequest
    ? 'Quote on request'
    : (priceLow != null ? `₹${priceLow.toLocaleString('en-IN')}–${priceHigh.toLocaleString('en-IN')}` : 'Price unavailable yet');

  if (isDesktopWeb) {
    return (
      <DesktopStandalonePage onBack={() => navigation.goBack()} title={label} maxWidth={800}>
        {loading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color={MAROON} /></View>
        ) : (
          <>
            <View style={ds.priceCard}>
              <Text style={ds.priceValue}>{priceText}</Text>
              {basis ? <Text style={ds.priceBasis}>{basis}</Text> : null}
            </View>
            <View style={ds.actionsRow}>
              <TouchableOpacity style={ds.primaryBtn} onPress={findVendor}>
                <Text style={ds.primaryBtnText}>Find a vendor</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ds.secondaryBtn, alreadyArranged && { opacity: 0.5 }]} onPress={markArranged} disabled={arranging || alreadyArranged}>
                {arranging ? <ActivityIndicator color={TEXT} size="small" /> : <Text style={ds.secondaryBtnText}>{alreadyArranged ? '✓ Arranged' : 'Mark as arranged'}</Text>}
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={ds.notifyBtn} onPress={notifyMe} disabled={notifying}>
              {notifying ? <ActivityIndicator color={MAROON} size="small" /> : <Text style={ds.notifyBtnText}>🔔 Notify me when a new vendor is available</Text>}
            </TouchableOpacity>

            <Text style={ds.sectionLabel}>{providers.length > 0 ? `VENDORS IN THIS CATEGORY (${providers.length})` : 'NO VENDORS LISTED YET'}</Text>
            {providers.length === 0 ? (
              <Text style={ds.emptyText}>No vendors listed here yet — tap notify above and we'll tell you when one is.</Text>
            ) : (
              <View style={ds.grid}>
                {providers.map(item => (
                  <TouchableOpacity key={item.id} style={ds.providerCard} onPress={() => navigation.navigate('ProviderProfile', { providerId: item.id, savedPlanId })}>
                    <Text style={ds.providerName}>{item.business_name || item.name || 'Unnamed provider'}</Text>
                    <Text style={ds.providerMeta}>{item.city}{item.rating ? ` · ⭐ ${item.rating.toFixed(1)}` : ''}</Text>
                  </TouchableOpacity>
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
      <AppHeader title={label} onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={providers}
          keyExtractor={p => p.id}
          contentContainerStyle={s.scroll}
          ListHeaderComponent={
            <>
              <View style={s.priceCard}>
                <Text style={s.priceValue}>{priceText}</Text>
                {basis ? <Text style={s.priceBasis}>{basis}</Text> : null}
              </View>

              <View style={s.actionsRow}>
                <TouchableOpacity style={s.primaryBtn} onPress={findVendor}>
                  <Text style={s.primaryBtnText}>Find a vendor</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.secondaryBtn, alreadyArranged && { opacity: 0.5 }]}
                  onPress={markArranged}
                  disabled={arranging || alreadyArranged}
                >
                  {arranging ? <ActivityIndicator color={theme.text} size="small" /> : (
                    <Text style={s.secondaryBtnText}>{alreadyArranged ? '✓ Arranged' : 'Mark as arranged'}</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={s.notifyBtn} onPress={notifyMe} disabled={notifying}>
                {notifying ? <ActivityIndicator color={theme.accent} size="small" /> : (
                  <Text style={s.notifyBtnText}>🔔 Notify me when a new vendor is available</Text>
                )}
              </TouchableOpacity>

              <Text style={s.sectionLabel}>
                {providers.length > 0 ? `VENDORS IN THIS CATEGORY (${providers.length})` : 'NO VENDORS LISTED YET'}
              </Text>
            </>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.providerRow} onPress={() => navigation.navigate('ProviderProfile', { providerId: item.id, savedPlanId })}>
              <Text style={s.providerName}>{item.business_name || item.name || 'Unnamed provider'}</Text>
              <Text style={s.providerMeta}>{item.city}{item.rating ? ` · ⭐ ${item.rating.toFixed(1)}` : ''}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            providers.length === 0 && !loading ? (
              <Text style={s.emptyText}>No vendors listed here yet — tap notify above and we'll tell you when one is.</Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backBtn: { width: 30 },
    backIcon: { fontSize: 20, color: theme.text },
    headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: theme.text, textAlign: 'center' },
    scroll: { padding: 20, paddingBottom: 60 },

    priceCard: { backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, padding: 18, marginBottom: 16, alignItems: 'center' },
    priceValue: { fontSize: 22, fontWeight: '700', color: theme.text, marginBottom: 6 },
    priceBasis: { fontSize: 12.5, color: theme.textSecondary, textAlign: 'center' },

    actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    primaryBtn: { flex: 1, backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    primaryBtnText: { color: theme.btnPrimaryText, fontSize: 13.5, fontWeight: '700' },
    secondaryBtn: { flex: 1, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    secondaryBtnText: { color: theme.text, fontSize: 13.5, fontWeight: '700' },

    notifyBtn: { paddingVertical: 12, alignItems: 'center', marginBottom: 20 },
    notifyBtnText: { color: theme.accent, fontSize: 13, fontWeight: '600' },

    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, letterSpacing: 0.5, marginBottom: 10 },
    providerRow: { backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, padding: 14, marginBottom: 8 },
    providerName: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 3 },
    providerMeta: { fontSize: 12, color: theme.textSecondary },
    emptyText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingVertical: 20, lineHeight: 19 },
  });
}

const ds = StyleSheet.create({
  priceCard: { backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 20, marginBottom: 18, alignItems: 'center' },
  priceValue: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, color: TEXT, marginBottom: 6 },
  priceBasis: { fontSize: 12.5, color: MUTED, textAlign: 'center' },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  primaryBtn: { flex: 1, backgroundColor: MAROON, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  secondaryBtn: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { color: TEXT, fontSize: 13.5, fontWeight: '700' },
  notifyBtn: { paddingVertical: 12, alignItems: 'center', marginBottom: 20 },
  notifyBtnText: { color: MAROON, fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.5, marginBottom: 10 },
  emptyText: { fontSize: 13, color: MUTED, textAlign: 'center', paddingVertical: 20, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  providerCard: { width: 240, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: LINE, padding: 14 },
  providerName: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 3 },
  providerMeta: { fontSize: 12, color: MUTED },
});
