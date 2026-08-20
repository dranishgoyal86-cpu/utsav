import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Platform,
  Modal, TextInput, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { confirmDestructive } from '../../helpers';
import { formatTimeLabel } from '../../lib/eventContext';
import { notifyServiceConfirmed, notifyBookingCompleted, notifyDisputeRaised } from '../../notifications';
import { canFastPathComplete } from '../../lib/bookingLifecycle';
import SwipeableRow from '../../components/SwipeableRow';
import AppHeader from '../../components/AppHeader';

// Cancellable from the customer's side — a completed/declined/cancelled/
// reviewed booking is a closed record, nothing left to cancel.
const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'payment_pending'];
// Deletable (archived, not row-deleted) from the customer's side — only once
// it's closed. Same archived_by_customer flag InboxScreen.js already uses to
// hide a booking's chat thread; the provider's own copy (archived_by_provider)
// is untouched, so this only removes it from the customer's own list.
const DELETABLE_STATUSES = ['completed', 'declined', 'cancelled', 'reviewed'];

export default function BookingsScreen({ navigation, route }) {
  const { theme } = useTheme();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(route?.params?.initialTab === 'past' ? 'past' : 'upcoming');
  const [disputeModalBooking, setDisputeModalBooking] = useState(null);
  const [disputeNotes, setDisputeNotes] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  const [disputing, setDisputing] = useState(false);
  const s = makeStyles(theme);
  // Reached from a specific plan's "View bookings" link — filters this
  // otherwise-flat list down to just the bookings made under that plan.
  const savedPlanId = route?.params?.savedPlanId || null;
  const planTitle = route?.params?.planTitle || null;

  // Bookings is a tab screen — stays mounted across visits, so the useState
  // initial value above only applies on first mount. The checklist's
  // "Review & rate vendors" link (initialTab: 'past') needs this to actually
  // switch tabs even when Bookings was already open on "upcoming".
  useEffect(() => {
    if (route?.params?.initialTab === 'past') setActiveTab('past');
  }, [route?.params?.initialTab]);

  useFocusEffect(
    useCallback(() => {
      fetchBookings();
    }, [savedPlanId])
  );

  function showAlert(title, message) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  async function fetchBookings() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch bookings — no join
      let query = supabase
        .from('bookings')
        .select('*')
        .eq('customer_id', session.user.id)
        .eq('archived_by_customer', false);
      if (savedPlanId) query = query.eq('saved_plan_id', savedPlanId);
      const { data: bookingsData, error } = await query.order('event_date', { ascending: true });

      if (error) throw error;
      if (!bookingsData?.length) { setBookings([]); return; }

      // Fetch related providers separately
      const providerIds = [...new Set(bookingsData.map(b => b.provider_id).filter(Boolean))];
      const { data: providersData } = await supabase
        .from('providers')
        .select('id, category, city, rating, user_id')
        .in('id', providerIds);

      // Fetch related provider users separately
      const providerUserIds = [...new Set(
        (providersData || []).map(p => p.user_id).filter(Boolean)
      )];
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, avatar_url')
        .in('id', providerUserIds);

      // Resolved separately so each card can link back to "its" event plan —
      // saved_plan_id is on the booking, but PlanView.js takes eventId, not
      // saved_plan_id, so this is the same two-hop bridge used everywhere
      // else in the app (saved_plans.event_id is the actual FK to events).
      const planIds = [...new Set(bookingsData.map(b => b.saved_plan_id).filter(Boolean))];
      let eventIdByPlanId = {};
      if (planIds.length > 0) {
        const { data: plansData } = await supabase.from('saved_plans').select('id, event_id').in('id', planIds);
        (plansData || []).forEach(p => { eventIdByPlanId[p.id] = p.event_id; });
      }

      // Manually join in JS
      const merged = bookingsData.map(b => {
        const provider = providersData?.find(p => p.id === b.provider_id) || null;
        const providerName = usersData?.find(u => u.id === provider?.user_id)?.name || 'Provider';
        const eventId = b.saved_plan_id ? eventIdByPlanId[b.saved_plan_id] : null;
        return { ...b, providers: provider, providerName, eventId };
      });

      setBookings(merged);
    } catch (err) {
      console.log('Bookings error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function cancelBooking(booking) {
    const bookingId = booking.id;
    const doCancel = async () => {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId);
      if (!error) {
        setBookings(prev =>
          prev.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b)
        );
      } else {
        showAlert('Error', error.message);
      }
    };

    // A confirmed, already-paid booking needs a different message — there's
    // no automatic refund system, so cancelling here doesn't return the
    // money on its own. Pending/payment_pending bookings haven't been
    // charged (or paid) yet, so the plain warning is accurate as-is.
    const isPaid = booking.status === 'confirmed' && booking.payment_id;
    const message = isPaid
      ? "This booking has already been paid for. Cancelling stops the booking, but doesn't automatically refund you — message the provider about a refund first if you haven't already agreed on one."
      : 'Are you sure you want to cancel? This cannot be undone.';

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Cancel booking?\n\n${message}`);
      if (confirmed) doCancel();
    } else {
      Alert.alert(
        'Cancel booking?',
        message,
        [
          { text: 'Keep booking', style: 'cancel' },
          { text: 'Cancel booking', style: 'destructive', onPress: doCancel }
        ]
      );
    }
  }

  function deleteBooking(booking) {
    confirmDestructive(
      'Delete this booking?',
      'This removes it from your bookings list. It stays on record for the provider, and this cannot be undone from here.',
      'Delete',
      async () => {
        const { error } = await supabase.from('bookings').update({ archived_by_customer: true }).eq('id', booking.id);
        if (!error) {
          setBookings(prev => prev.filter(b => b.id !== booking.id));
        } else {
          showAlert('Error', error.message);
        }
      }
    );
  }

  // Host-side half of the mutual-confirmation fast path (ProviderERP.js's
  // updateStatus() carries the provider-side half). Setting host_confirmed_at
  // never flips status on its own — only when BOTH timestamps end up set
  // (checked here, right after the write, same as the provider side) does
  // the booking actually move to 'completed'. A booking currently under
  // dispute can't complete this way either — raising a dispute should never
  // be silently overridden by the other side confirming a moment later.
  async function confirmServiceDelivered(booking) {
    setConfirmingId(booking.id);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('bookings')
        .update({ host_confirmed_at: now })
        .eq('id', booking.id);
      if (error) throw error;

      const patch = { host_confirmed_at: now };

      if (canFastPathComplete({ ...booking, host_confirmed_at: now })) {
        const { error: completeError } = await supabase
          .from('bookings')
          .update({ status: 'completed', completed_at: now })
          .eq('id', booking.id);
        if (completeError) throw completeError;
        patch.status = 'completed';
        patch.completed_at = now;
        if (booking.providers?.user_id) {
          await notifyBookingCompleted(booking.providers.user_id, booking.event_type, booking.id);
        }
      } else if (booking.providers?.user_id) {
        await notifyServiceConfirmed(booking.providers.user_id, 'The host', booking.event_type, booking.id);
      }

      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, ...patch } : b));
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setConfirmingId(null);
    }
  }

  function openDisputeModal(booking) {
    setDisputeModalBooking(booking);
    setDisputeNotes('');
  }

  async function submitDispute() {
    if (!disputeNotes.trim()) {
      showAlert('Add a note', "Briefly describe what's wrong — this is what the admin team and the provider will see.");
      return;
    }
    const booking = disputeModalBooking;
    setDisputing(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('bookings')
        .update({
          dispute_status: 'raised',
          dispute_raised_by: 'host',
          dispute_raised_at: now,
          dispute_notes: disputeNotes.trim(),
        })
        .eq('id', booking.id);
      if (error) throw error;

      setBookings(prev => prev.map(b => b.id === booking.id
        ? { ...b, dispute_status: 'raised', dispute_raised_by: 'host', dispute_raised_at: now, dispute_notes: disputeNotes.trim() }
        : b));

      if (booking.providers?.user_id) {
        await notifyDisputeRaised(booking.providers.user_id, 'The host', booking.event_type, booking.id);
      }

      setDisputeModalBooking(null);
      setDisputeNotes('');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setDisputing(false);
    }
  }

  // Single entry point into a booking, whatever needs doing with it —
  // recheck details, modify them, or complete a pending payment. All three
  // used to be scattered (an inline list editor, plus a separate payment
  // button) — CreateBookingScreen.js now handles an existing booking the
  // same way it handles a new one, just keyed by bookingId instead of a
  // fresh provider/service pair.
  function openBooking(booking) {
    navigation.navigate('Booking', { bookingId: booking.id });
  }

  const upcoming = bookings.filter(b =>
    ['pending', 'confirmed', 'payment_pending'].includes(b.status) &&
    new Date(b.event_date) >= new Date()
  );

  const past = bookings.filter(b =>
    ['completed', 'declined', 'cancelled', 'reviewed'].includes(b.status) ||
    (b.status === 'confirmed' && new Date(b.event_date) < new Date())
  );

  const displayed = activeTab === 'upcoming' ? upcoming : past;

  const STATUS = {
    // A booking created via "Confirm with vendor first" (CreateBookingScreen.js)
    // — a real bookings row with no payment yet, meant for negotiating terms
    // in chat before committing. Label distinguishes it from payment_pending
    // (terms already settled, payment is the only thing left).
    pending: { label: 'Confirm terms with vendor', bg: theme.statusPending, color: theme.statusPendingText, icon: '💬' },
    payment_pending: { label: 'Payment pending', bg: '#FFF3E0', color: '#E65100', icon: '💳' },
    confirmed: { label: 'Confirmed', bg: theme.statusConfirmed, color: theme.statusConfirmedText, icon: '✓' },
    completed: { label: 'Completed', bg: theme.statusConfirmed, color: theme.statusConfirmedText, icon: '✓' },
    reviewed: { label: 'Reviewed', bg: '#E8F5E9', color: '#2E7D32', icon: '⭐' },
    declined: { label: 'Declined', bg: theme.statusDeclined, color: theme.statusDeclinedText, icon: '✗' },
    cancelled: { label: 'Cancelled', bg: theme.bgSecondary, color: theme.textSecondary, icon: '✗' },
    payment_failed: { label: 'Payment failed', bg: theme.statusDeclined, color: theme.statusDeclinedText, icon: '!' },
  };

  function getDaysUntil(dateStr) {
    const diff = new Date(dateStr) - new Date();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today!';
    if (days === 1) return 'Tomorrow';
    if (days < 0) return `${Math.abs(days)} days ago`;
    return `in ${days} days`;
  }

  function getEventIcon(eventType) {
    const icons = {
      'Wedding': '💍', 'Birthday': '🎂', 'Corporate': '💼',
      'Diwali': '🪔', 'Engagement': '💑', 'Baby Shower': '🍼',
      'Anniversary': '❤️',
    };
    return icons[eventType] || '🎉';
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title={savedPlanId ? 'Plan bookings' : 'Bookings'}
        onBack={savedPlanId ? () => navigation.goBack() : undefined}
        theme={theme}
        navigation={navigation}
        rightActions={[
          <TouchableOpacity key="vendors" style={s.inboxBtn} onPress={() => navigation.navigate('PersonalVendors')}>
            <Text style={s.inboxBtnIcon}>🤝</Text>
          </TouchableOpacity>,
          <TouchableOpacity key="inbox" style={s.inboxBtn} onPress={() => navigation.navigate('Inbox')}>
            <Text style={s.inboxBtnIcon}>💬</Text>
          </TouchableOpacity>,
        ]}
      />
      {savedPlanId && planTitle ? (
        <Text style={[s.filterSubtitle, { paddingHorizontal: 20, marginTop: -10, marginBottom: 10 }]} numberOfLines={1}>{planTitle}</Text>
      ) : null}

      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tab, activeTab === 'upcoming' && s.tabActive]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[s.tabText, activeTab === 'upcoming' && s.tabTextActive]}>
            Upcoming {upcoming.length > 0 ? `(${upcoming.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === 'past' && s.tabActive]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[s.tabText, activeTab === 'past' && s.tabTextActive]}>
            Past {past.length > 0 ? `(${past.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={s.loadingText}>Loading your bookings...</Text>
        </View>
      ) : displayed.length === 0 ? (
        <View style={s.centerBox}>
          <Text style={s.emptyIcon}>{activeTab === 'upcoming' ? '📅' : '📋'}</Text>
          <Text style={s.emptyTitle}>
            {activeTab === 'upcoming' ? 'No upcoming bookings' : 'No past bookings'}
          </Text>
          <Text style={s.emptySub}>
            {activeTab === 'upcoming'
              ? 'Discover vendors and book your first event service'
              : 'Your completed bookings will appear here'}
          </Text>
          {activeTab === 'upcoming' && (
            <TouchableOpacity
              style={s.discoverBtn}
              onPress={() => navigation.navigate('Discover')}
            >
              <Text style={s.discoverBtnText}>Browse vendors →</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchBookings(); }}
              tintColor={theme.accent}
            />
          }
        >
          {displayed.map(booking => {
            const st = STATUS[booking.status] || STATUS.pending;
            const isUpcoming = activeTab === 'upcoming';
            const daysUntil = getDaysUntil(booking.event_date);
            const isUrgent = booking.status === 'confirmed' &&
              new Date(booking.event_date) - new Date() < 7 * 24 * 60 * 60 * 1000 &&
              new Date(booking.event_date) > new Date();
            // Event already happened but the booking hasn't reached
            // 'completed' yet — the window where "Confirm service delivered"
            // / "Something's wrong" actions apply. Same condition the
            // "past" tab itself already uses to surface a still-confirmed
            // booking (see the `past` filter above), so this is exactly the
            // set of cards a host would expect to be able to close out.
            const awaitingClosure = booking.status === 'confirmed' && new Date(booking.event_date) < new Date();
            const isDisputed = booking.dispute_status === 'raised';

            const content = (
              <TouchableOpacity
                style={[s.bookingCard, isUrgent && s.bookingCardUrgent]}
                activeOpacity={0.85}
                onPress={() => openBooking(booking)}
              >
                {isUrgent && (
                  <View style={s.urgentBanner}>
                    <Text style={s.urgentText}>
                      🔔 Event {daysUntil} — confirm all details with your provider!
                    </Text>
                  </View>
                )}

                {/* Card top */}
                <View style={s.cardTop}>
                  <View style={s.eventIconBox}>
                    <Text style={s.eventIcon}>{getEventIcon(booking.event_type)}</Text>
                  </View>
                  <View style={s.cardTopInfo}>
                    <Text style={s.bookingTitle}>
                      {booking.event_type}
                      <Text style={s.bookingProvider}> · {booking.providerName}</Text>
                    </Text>
                    <Text style={s.bookingCategory}>{booking.providers?.category}</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[s.statusText, { color: st.color }]}>
                      {st.icon} {st.label}
                    </Text>
                  </View>
                </View>

                {/* Details */}
                <View style={s.cardDetails}>
                  <View style={s.detailRow}>
                    <Text style={s.detailIcon}>📅</Text>
                    <View style={s.detailRight}>
                      <Text style={s.detailText}>
                        {new Date(booking.event_date).toLocaleDateString('en-IN', {
                          weekday: 'long', day: 'numeric',
                          month: 'long', year: 'numeric'
                        })}
                        {booking.event_time ? ` · ${formatTimeLabel(booking.event_time)}` : ''}
                      </Text>
                      {isUpcoming && (
                        <Text style={[s.daysUntil, {
                          color: daysUntil.includes('Today') || daysUntil.includes('Tomorrow')
                            ? theme.statusPendingText : theme.textSecondary
                        }]}>
                          {daysUntil}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={s.detailRow}>
                    <Text style={s.detailIcon}>📍</Text>
                    <Text style={s.detailText}>{booking.venue}</Text>
                  </View>
                  <View style={s.detailRow}>
                    <Text style={s.detailIcon}>👥</Text>
                    <Text style={s.detailText}>{booking.guest_count} guests</Text>
                  </View>
                  {booking.notes ? (
                    <View style={s.detailRow}>
                      <Text style={s.detailIcon}>📝</Text>
                      <Text style={s.detailText} numberOfLines={2}>{booking.notes}</Text>
                    </View>
                  ) : null}
                  {booking.eventId && (
                    <TouchableOpacity
                      style={s.planLinkRow}
                      onPress={() => navigation.navigate('PlanView', { eventId: booking.eventId })}
                    >
                      <Text style={s.planLinkText}>📋 View event plan →</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={s.tapHint}>
                    {booking.status === 'payment_pending' ? 'Tap to recheck details and complete payment →' : 'Tap to view or modify →'}
                  </Text>
                </View>

                {/* Amount */}
                <View style={s.amountRow}>
                  <View>
                    <Text style={s.amountLabel}>Total amount</Text>
                    <Text style={s.amountValue}>
                      ₹{booking.total_amount?.toLocaleString()}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.amountLabel}>Booking ID</Text>
                    <Text style={s.bookingId}>
                      {booking.id?.slice(0, 8).toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Mutual-confirmation closure — event's happened, booking's
                    still 'confirmed'. Disputed takes priority over showing
                    the confirm/dispute buttons; a host who already confirmed
                    sees a waiting note instead of the button again. */}
                {isDisputed ? (
                  <View style={s.disputeBanner}>
                    <Text style={s.disputeBannerText}>
                      ⚠️ Dispute raised{booking.dispute_raised_by === 'host' ? ' by you' : ' by the provider'} — our team is reviewing it.
                    </Text>
                  </View>
                ) : awaitingClosure && (
                  <View style={s.closureBox}>
                    {booking.host_confirmed_at ? (
                      <Text style={s.closureWaitingText}>✓ You confirmed — waiting for the provider to confirm too.</Text>
                    ) : (
                      <View style={s.closureBtnRow}>
                        <TouchableOpacity
                          style={s.confirmDeliveredBtn}
                          onPress={() => confirmServiceDelivered(booking)}
                          disabled={confirmingId === booking.id}
                        >
                          {confirmingId === booking.id
                            ? <ActivityIndicator size="small" color="#FFF" />
                            : <Text style={s.confirmDeliveredBtnText}>✓ Confirm service delivered</Text>
                          }
                        </TouchableOpacity>
                        <TouchableOpacity style={s.disputeBtn} onPress={() => openDisputeModal(booking)}>
                          <Text style={s.disputeBtnText}>Something's wrong</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}

                {/* Actions */}
                <View style={s.actionRow}>
                  {(booking.status === 'confirmed' || booking.status === 'completed') && (
                    <TouchableOpacity
                      style={s.vendorsLinkBtn}
                      onPress={() => navigation.navigate('PersonalVendors', {
                        bookingId: booking.id,
                        eventTitle: booking.event_type,
                      })}
                    >
                      <Text style={s.vendorsLinkBtnText}>🤝 My vendors</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={s.actionRow}>
                  {booking.status === 'payment_pending' && (
                    <TouchableOpacity
                      style={[s.primaryBtn, { backgroundColor: '#2E7D32', flex: 1 }]}
                      onPress={() => openBooking(booking)}
                    >
                      <Text style={s.primaryBtnText}>Complete payment →</Text>
                    </TouchableOpacity>
                  )}

                  {booking.status === 'pending' && (
                    <TouchableOpacity
                      style={[s.primaryBtn, { flex: 1 }]}
                      onPress={() => openBooking(booking)}
                    >
                      <Text style={s.primaryBtnText}>Select terms & pay →</Text>
                    </TouchableOpacity>
                  )}

                  {/* Chat stays available for 'pending' too — it's the whole
                      point of that state (negotiating terms before paying),
                      unlike payment_pending where terms are already settled
                      and chat isn't the next action. */}
                  {booking.status !== 'payment_pending' && (
                    <TouchableOpacity
                      style={[s.primaryBtn, { flex: 1 }]}
                      onPress={() => navigation.navigate('Chat', {
                        booking,
                        receiverId: booking.providers?.user_id,
                        receiverName: booking.providerName,
                      })}
                    >
                      <Text style={s.primaryBtnText}>💬 Message</Text>
                    </TouchableOpacity>
                  )}

                  {activeTab === 'past' && booking.status === 'completed' && (
                    <TouchableOpacity
                      style={s.reviewBtn}
                      onPress={() => navigation.navigate('WriteReview', { booking })}
                    >
                      <Text style={s.reviewBtnText}>⭐ Review</Text>
                    </TouchableOpacity>
                  )}

                  {(booking.status === 'completed' || booking.status === 'reviewed') && (
                    <TouchableOpacity
                      style={s.reviewBtn}
                      onPress={() => navigation.navigate('ShareEventPhotos', { booking })}
                    >
                      <Text style={s.reviewBtnText}>📸 Share photos</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {booking.payment_id && (
                  <TouchableOpacity
                    style={s.receiptRow}
                    onPress={() => navigation.navigate('PaymentReceipt', { booking })}
                  >
                    <Text style={s.receiptRowText}>🧾 View receipt →</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );

            if (CANCELLABLE_STATUSES.includes(booking.status)) {
              return (
                <SwipeableRow
                  key={booking.id}
                  style={s.bookingCardWrap}
                  onDelete={() => cancelBooking(booking)}
                  deleteLabel="Cancel"
                >
                  {content}
                </SwipeableRow>
              );
            }
            if (DELETABLE_STATUSES.includes(booking.status)) {
              return (
                <SwipeableRow
                  key={booking.id}
                  style={s.bookingCardWrap}
                  onDelete={() => deleteBooking(booking)}
                  deleteLabel="Delete"
                >
                  {content}
                </SwipeableRow>
              );
            }
            return <View key={booking.id} style={s.bookingCardWrap}>{content}</View>;
          })}
          <View style={{ height: 140 }} />
        </ScrollView>
      )}

      <Modal visible={!!disputeModalBooking} transparent animationType="fade" onRequestClose={() => setDisputeModalBooking(null)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Raise a dispute</Text>
            <Text style={s.modalHint}>
              This freezes the booking and notifies the provider and our team — it won't auto-complete while a dispute is open.
            </Text>
            <TextInput
              style={s.disputeInput}
              placeholder="What went wrong?"
              placeholderTextColor={theme.textTertiary}
              value={disputeNotes}
              onChangeText={setDisputeNotes}
              multiline
              autoFocus
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setDisputeModalBooking(null)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSubmitBtn} onPress={submitDispute} disabled={disputing}>
                {disputing ? <ActivityIndicator color="#FFF" /> : <Text style={s.modalSubmitText}>Submit dispute</Text>}
              </TouchableOpacity>
            </View>
          </View>
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
    filterSubtitle: { fontSize: 13, color: theme.textSecondary, fontWeight: '600', marginTop: 2 },
    inboxBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: theme.cardBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border },
    inboxBtnIcon: { fontSize: 18 },

    tabRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginTop: 16, marginBottom: 18 },
    tab: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 18, backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border },
    tabActive: { backgroundColor: theme.text, borderColor: theme.text },
    tabText: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
    tabTextActive: { color: theme.bg },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    loadingText: { marginTop: 12, fontSize: 14, color: theme.textSecondary },
    emptyIcon: { fontSize: 40, marginBottom: 14, opacity: 0.5 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 8 },
    emptySub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 22 },
    discoverBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13 },
    discoverBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    bookingCardWrap: { marginHorizontal: 16, marginBottom: 14, borderRadius: 20 },
    bookingCard: {
      backgroundColor: theme.cardBg, borderRadius: 20,
      borderWidth: 0.5, borderColor: theme.border,
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 14, shadowOffset: { width: 0, height: 5 },
      overflow: 'hidden',
    },
    bookingCardUrgent: { borderColor: '#E65100', borderWidth: 1 },
    urgentBanner: { backgroundColor: '#FFF3E0', paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 0.5, borderBottomColor: '#FFE0B2' },
    urgentText: { fontSize: 12, color: '#E65100', fontWeight: '600' },

    cardTop: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 },
    eventIconBox: { width: 46, height: 46, borderRadius: 16, backgroundColor: theme.bgSecondary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    eventIcon: { fontSize: 22 },
    cardTopInfo: { flex: 1 },
    bookingTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 2 },
    bookingProvider: { fontSize: 13, fontWeight: '400', color: theme.textSecondary },
    bookingCategory: { fontSize: 12, color: theme.textSecondary },
    statusBadge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, flexShrink: 0 },
    statusText: { fontSize: 11, fontWeight: '700' },

    cardDetails: { paddingHorizontal: 16, paddingBottom: 14, gap: 9 },
    detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    detailIcon: { fontSize: 13, width: 18, marginTop: 1 },
    detailRight: { flex: 1 },
    detailText: { fontSize: 13, color: theme.textSecondary, flex: 1, lineHeight: 18 },
    daysUntil: { fontSize: 11, fontWeight: '700', marginTop: 2 },

    planLinkRow: { paddingTop: 4 },
    planLinkText: { fontSize: 12.5, fontWeight: '700', color: theme.accent },
    tapHint: { fontSize: 11.5, color: theme.textTertiary, marginTop: 2 },

    amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: theme.border },
    amountLabel: { fontSize: 11, color: theme.textSecondary, marginBottom: 2 },
    amountValue: { fontSize: 17, fontWeight: '700', color: theme.text },
    bookingId: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },

    actionRow: { flexDirection: 'row', gap: 8, padding: 14, paddingTop: 0 },
    vendorsLinkBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center', marginBottom: 8 },
    vendorsLinkBtnText: { fontSize: 12.5, color: theme.text, fontWeight: '600' },
    primaryBtn: { paddingVertical: 11, borderRadius: 12, backgroundColor: theme.btnPrimary, alignItems: 'center' },
    primaryBtnText: { fontSize: 13, color: theme.btnPrimaryText, fontWeight: '700' },
    reviewBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: '#FFF8F0', borderWidth: 0.5, borderColor: '#FFE0B2', alignItems: 'center' },
    reviewBtnText: { fontSize: 13, color: '#E65100', fontWeight: '700' },
    receiptRow: { paddingHorizontal: 16, paddingBottom: 12 },
    receiptRowText: { fontSize: 12, fontWeight: '700', color: theme.accent },

    closureBox: { paddingHorizontal: 16, paddingBottom: 12 },
    closureBtnRow: { flexDirection: 'row', gap: 8 },
    confirmDeliveredBtn: { flex: 2, paddingVertical: 11, borderRadius: 12, backgroundColor: '#2E7D32', alignItems: 'center' },
    confirmDeliveredBtnText: { fontSize: 13, color: '#FFF', fontWeight: '700' },
    disputeBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 0.5, borderColor: theme.statusDeclinedText, alignItems: 'center' },
    disputeBtnText: { fontSize: 12.5, color: theme.statusDeclinedText, fontWeight: '700' },
    closureWaitingText: { fontSize: 12.5, color: theme.textSecondary, fontStyle: 'italic' },
    disputeBanner: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: theme.statusDeclined },
    disputeBannerText: { fontSize: 12.5, color: theme.statusDeclinedText, fontWeight: '600' },

    overlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', padding: 24 },
    modal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 20 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 8 },
    modalHint: { fontSize: 12.5, color: theme.textSecondary, lineHeight: 18, marginBottom: 14 },
    disputeInput: { backgroundColor: theme.bg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, padding: 13, fontSize: 14, color: theme.text, minHeight: 90, textAlignVertical: 'top' },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    modalCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center' },
    modalCancelText: { fontSize: 14, fontWeight: '700', color: theme.text },
    modalSubmitBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: theme.statusDeclinedText, alignItems: 'center' },
    modalSubmitText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  });
}
