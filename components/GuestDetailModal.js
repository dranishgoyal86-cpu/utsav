import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ScrollView, Switch, ActivityIndicator, Linking } from 'react-native';
import { X, Star } from 'phosphor-react-native';
import { getSignedGuestDocumentUrl } from '../helpers';

const FOOD_PREF_OPTIONS = [
  { key: 'any', label: 'Any' },
  { key: 'veg', label: '🥦 Veg' },
  { key: 'nonveg', label: '🍗 Non-veg' },
  { key: 'jain', label: '🙏 Jain' },
];

const GIFT_TYPES = [
  { key: 'cash', label: '💵 Cash' },
  { key: 'item', label: '🎁 Item' },
];

// Same 4 statuses/order as GuestList.js's own RSVP constant (kept as a
// separate local copy, matching this file's existing pattern of defining
// FOOD_PREF_OPTIONS/GIFT_TYPES locally rather than importing screen-level
// constants) — this is the "more deliberate" RSVP entry point, distinct
// from the quick-cycle chip in the guest list row.
const RSVP_OPTIONS = [
  { key: 'pending', label: 'Pending' },
  { key: 'yes', label: 'Coming' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'no', label: 'Declined' },
];

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) {
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'just now';
    return `${hours}h ago`;
  }
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

// Sits behind a small "···" icon on each guest card — the fast Add/Edit
// modal (name/phone/tag) stays untouched as the quick-add path; everything
// added for the 7-feature batch lives here instead of bloating every list
// row with 6 more inline controls. table_number/checked_in_at/invite_sent_at
// are read-only here (set from SeatingChart/CheckInScanner/sendWhatsappTo)
// except check-in, which also gets a manual override for bad-lighting/lost-
// QR cases — applied instantly, not gated behind the Save button below.
export default function GuestDetailModal({ visible, guest, event, theme, onClose, onSave, navigation, onShareInvite, onSendPass, onSendThankYou, onMarkArrived, eventFunctions = [], guestFunctionIds = [], onToggleFunction, eventAccommodations = [], accompanying = [] }) {
  const s = styles(theme);
  const [viewingDocPath, setViewingDocPath] = useState(null);
  const [foodPref, setFoodPref] = useState('any');
  const [allergies, setAllergies] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [giftType, setGiftType] = useState(null);
  const [giftAmount, setGiftAmount] = useState('');
  const [giftNote, setGiftNote] = useState('');
  const [returnGiftGiven, setReturnGiftGiven] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState('pending');
  const [hostLoggedNote, setHostLoggedNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [savingReturnGift, setSavingReturnGift] = useState(false);

  // Travel/stay — arrival/departure/pickup are guest-self-reportable (via
  // RSVPScreen.js) but the host can freely enter/override them too, for
  // guests who told them directly instead of self-reporting. No separate
  // provenance tracking for this section (unlike RSVP's host_logged vs
  // guest_self split) — deliberately kept simple, since a host edit here is
  // just as authoritative either way and there's no equivalent case where
  // silently overwriting a guest's own answer would mislabel anything.
  // accommodation_id/room_number/pickup_notes are ALWAYS host-only, never
  // touched by submit-rsvp.
  const [isOutstation, setIsOutstation] = useState(false);
  const [arrivalDate, setArrivalDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [arrivalDetails, setArrivalDetails] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [pickupNeeded, setPickupNeeded] = useState(false);
  const [pickupNotes, setPickupNotes] = useState('');
  const [accommodationId, setAccommodationId] = useState(null);
  const [roomNumber, setRoomNumber] = useState('');

  useEffect(() => {
    if (!guest) return;
    setFoodPref(guest.food_pref || 'any');
    setAllergies(guest.allergies || '');
    setIsVip(!!guest.is_vip);
    setGiftType(guest.gift_type || null);
    setGiftAmount(guest.gift_amount != null ? String(guest.gift_amount) : '');
    setGiftNote(guest.gift_note || '');
    setReturnGiftGiven(!!guest.return_gift_given);
    setRsvpStatus(guest.rsvp_status || 'pending');
    setHostLoggedNote(guest.host_logged_note || '');
    setIsOutstation(!!guest.is_outstation);
    setArrivalDate(guest.arrival_date || '');
    setArrivalTime(guest.arrival_time || '');
    setArrivalDetails(guest.arrival_details || '');
    setDepartureDate(guest.departure_date || '');
    setDepartureTime(guest.departure_time || '');
    setPickupNeeded(!!guest.pickup_needed);
    setPickupNotes(guest.pickup_notes || '');
    setAccommodationId(guest.accommodation_id || null);
    setRoomNumber(guest.room_number || '');
  }, [
    guest?.id, guest?.food_pref, guest?.allergies, guest?.is_vip, guest?.gift_type, guest?.gift_amount,
    guest?.gift_note, guest?.return_gift_given, guest?.rsvp_status, guest?.host_logged_note,
    guest?.is_outstation, guest?.arrival_date, guest?.arrival_time, guest?.arrival_details,
    guest?.departure_date, guest?.departure_time, guest?.pickup_needed, guest?.pickup_notes,
    guest?.accommodation_id, guest?.room_number,
  ]);

  if (!guest) return null;

  async function handleSave() {
    // Captured before onSave() — a "newly logged" gift means it wasn't set
    // on the guest row before this save, not just that a gift type is
    // currently selected (that would re-prompt on every unrelated edit to
    // an already-thanked guest, e.g. changing their meal preference).
    const isNewGift = !guest.gift_type && !!giftType;
    const trimmedNote = hostLoggedNote.trim() || null;
    // RSVP fields only go in the patch when the host actually changed
    // something about them THIS save — otherwise an unrelated edit (just
    // fixing allergies, say) would silently overwrite a real guest_self tag
    // with host_logged, mislabeling info the guest actually gave themselves.
    const rsvpTouched = rsvpStatus !== (guest.rsvp_status || 'pending') || trimmedNote !== (guest.host_logged_note || null);
    setSaving(true);
    try {
      await onSave(guest.id, {
        food_pref: foodPref,
        allergies: allergies.trim() || null,
        is_vip: isVip,
        gift_type: giftType,
        gift_amount: giftType === 'cash' && giftAmount ? parseFloat(giftAmount) : null,
        gift_note: giftType === 'item' ? (giftNote.trim() || null) : null,
        // return_gift_given is NOT included here — toggleReturnGift() below
        // already writes it instantly, the moment the Switch is flipped.
        ...(rsvpTouched ? { rsvp_status: rsvpStatus, rsvp_source: 'host_logged', host_logged_note: trimmedNote } : {}),
        is_outstation: isOutstation,
        arrival_date: isOutstation ? (arrivalDate.trim() || null) : null,
        arrival_time: isOutstation ? (arrivalTime.trim() || null) : null,
        arrival_details: isOutstation ? (arrivalDetails.trim() || null) : null,
        departure_date: isOutstation ? (departureDate.trim() || null) : null,
        departure_time: isOutstation ? (departureTime.trim() || null) : null,
        pickup_needed: isOutstation && pickupNeeded,
        pickup_notes: isOutstation && pickupNeeded ? (pickupNotes.trim() || null) : null,
        // accommodation/room stay independent of the outstation toggle — a
        // local guest can still be put up in a room (large family, elderly
        // relative), so these are never cleared just because isOutstation
        // is off.
        accommodation_id: accommodationId,
        room_number: roomNumber.trim() || null,
      });
      onClose();
      if (isNewGift && onSendThankYou) onSendThankYou(guest);
    } finally {
      setSaving(false);
    }
  }

  async function toggleCheckIn() {
    setCheckingIn(true);
    try {
      if (guest.checked_in_at) {
        // Undo — the host is explicitly reversing whatever's there, no race
        // guard needed (unlike marking arrived, there's no "genuine scan
        // just landed" scenario to protect against on the way down).
        await onSave(guest.id, { checked_in_at: null, checkin_source: null });
      } else if (onMarkArrived) {
        await onMarkArrived(guest.id);
      } else {
        await onSave(guest.id, { checked_in_at: new Date().toISOString(), checkin_source: 'host_manual' });
      }
    } finally {
      setCheckingIn(false);
    }
  }

  // Fast, one-tap door-side action — a helper handing out return gifts
  // shouldn't have to open the full form and hit Save. Applied instantly,
  // same pattern as toggleCheckIn() right above (this modal already sits
  // one tap away from any guest row, so "reachable without navigating to a
  // separate screen" was already true — this just makes the toggle itself
  // instant instead of gated behind the Save button below).
  async function toggleReturnGift() {
    const next = !returnGiftGiven;
    setSavingReturnGift(true);
    setReturnGiftGiven(next);
    try {
      await onSave(guest.id, { return_gift_given: next });
    } finally {
      setSavingReturnGift(false);
    }
  }

  // Guest-submitted documents are read-only here (host never edits/
  // uploads on a guest's behalf, matching the whole govt-ID flow being
  // guest-initiated via RSVPScreen.js) — resolved to a real signed URL
  // lazily, on tap, rather than eagerly for every document every time this
  // modal opens.
  async function viewGovtId(path) {
    if (!path) return;
    setViewingDocPath(path);
    try {
      const url = await getSignedGuestDocumentUrl(path);
      if (url) Linking.openURL(url);
    } finally {
      setViewingDocPath(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.modal, { maxHeight: '85%' }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{guest.name}</Text>
              <TouchableOpacity onPress={onClose}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            {guest.info_changed_at ? (
              <View style={[s.householdBadge, { backgroundColor: '#FFF3E0' }]}>
                <Text style={[s.householdBadgeText, { color: '#E65100' }]}>✎ Guest updated their name/phone since you last reviewed them</Text>
              </View>
            ) : null}
            {guest.entry_type === 'household' ? (
              <View style={[s.householdBadge, { backgroundColor: theme.accent + '18' }]}>
                <Text style={[s.householdBadgeText, { color: theme.accent }]}>🏠 Household · {guest.household_size || 1} people</Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Text style={s.sectionLabel}>RSVP</Text>
              {guest.rsvp_source === 'host_logged' ? <Text style={s.sourceTag}>logged by host</Text> : null}
            </View>
            <View style={s.chipsWrap}>
              {RSVP_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.chip, rsvpStatus === opt.key && s.chipActive]}
                  onPress={() => setRsvpStatus(opt.key)}
                >
                  <Text style={[s.chipText, rsvpStatus === opt.key && s.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={s.input}
              placeholder="Note (optional) — e.g. Called Aug 10, confirmed with 2 kids"
              placeholderTextColor={theme.textSecondary}
              value={hostLoggedNote}
              onChangeText={setHostLoggedNote}
            />

            {/* Only appears once the host has defined functions for this
                event — invisible for the common single-list case. Instant
                toggle (not gated behind the Save button below), same as
                check-in/return-gift above — a multi-select checkbox set
                benefits from immediate feedback more than being bundled
                into the bigger form save. */}
            {eventFunctions.length > 0 && onToggleFunction ? (
              <>
                <Text style={s.sectionLabel}>Invited to</Text>
                <View style={s.chipsWrap}>
                  {eventFunctions.map(func => {
                    const active = guestFunctionIds.includes(func.id);
                    return (
                      <TouchableOpacity
                        key={func.id}
                        style={[s.chip, active && s.chipActive]}
                        onPress={() => onToggleFunction(guest.id, func.id)}
                      >
                        <Text style={[s.chipText, active && s.chipTextActive]}>{active ? '✓ ' : ''}{func.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {guestFunctionIds.length === 0 ? (
                  <Text style={s.sourceTag}>Not tagged to any — invited to everything by default.</Text>
                ) : null}
              </>
            ) : null}

            <View style={s.row}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Star size={16} color={isVip ? '#F0A93F' : theme.textSecondary} weight={isVip ? 'fill' : 'regular'} />
                <Text style={s.rowLabel}>VIP guest</Text>
              </View>
              <Switch value={isVip} onValueChange={setIsVip} trackColor={{ false: theme.border, true: theme.accent }} thumbColor={theme.bg} />
            </View>

            <Text style={s.sectionLabel}>Meal preference</Text>
            <View style={s.chipsWrap}>
              {FOOD_PREF_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.chip, foodPref === opt.key && s.chipActive]}
                  onPress={() => setFoodPref(opt.key)}
                >
                  <Text style={[s.chipText, foodPref === opt.key && s.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={s.input}
              placeholder="Allergies (optional) — e.g. peanuts, shellfish"
              placeholderTextColor={theme.textSecondary}
              value={allergies}
              onChangeText={setAllergies}
            />

            <Text style={s.sectionLabel}>Gift received</Text>
            <View style={s.chipsWrap}>
              <TouchableOpacity style={[s.chip, !giftType && s.chipActive]} onPress={() => setGiftType(null)}>
                <Text style={[s.chipText, !giftType && s.chipTextActive]}>None</Text>
              </TouchableOpacity>
              {GIFT_TYPES.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.chip, giftType === opt.key && s.chipActive]}
                  onPress={() => setGiftType(opt.key === giftType ? null : opt.key)}
                >
                  <Text style={[s.chipText, giftType === opt.key && s.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {giftType === 'cash' && (
              <TextInput
                style={s.input}
                placeholder="Amount (₹)"
                placeholderTextColor={theme.textSecondary}
                value={giftAmount}
                onChangeText={setGiftAmount}
                keyboardType="numeric"
              />
            )}
            {giftType === 'item' && (
              <TextInput
                style={s.input}
                placeholder="What did they bring? e.g. Toaster"
                placeholderTextColor={theme.textSecondary}
                value={giftNote}
                onChangeText={setGiftNote}
              />
            )}
            <View style={s.row}>
              <Text style={s.rowLabel}>Return gift given</Text>
              {savingReturnGift ? <ActivityIndicator size="small" color={theme.accent} /> : (
                <Switch value={returnGiftGiven} onValueChange={toggleReturnGift} trackColor={{ false: theme.border, true: theme.accent }} thumbColor={theme.bg} />
              )}
            </View>

            <Text style={s.sectionLabel}>Travel & stay</Text>
            <View style={s.row}>
              <Text style={s.rowLabel}>Traveling from outside town</Text>
              <Switch value={isOutstation} onValueChange={setIsOutstation} trackColor={{ false: theme.border, true: theme.accent }} thumbColor={theme.bg} />
            </View>
            {isOutstation && (
              <View style={s.travelBox}>
                <Text style={s.travelFieldLabel}>Arrival</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[s.input, { flex: 1, marginTop: 0 }]} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textSecondary} value={arrivalDate} onChangeText={setArrivalDate} />
                  <TextInput style={[s.input, { flex: 1, marginTop: 0 }]} placeholder="HH:MM" placeholderTextColor={theme.textSecondary} value={arrivalTime} onChangeText={setArrivalTime} />
                </View>
                <TextInput style={s.input} placeholder="Flight/train details" placeholderTextColor={theme.textSecondary} value={arrivalDetails} onChangeText={setArrivalDetails} />
                <Text style={s.travelFieldLabel}>Departure</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[s.input, { flex: 1, marginTop: 0 }]} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textSecondary} value={departureDate} onChangeText={setDepartureDate} />
                  <TextInput style={[s.input, { flex: 1, marginTop: 0 }]} placeholder="HH:MM" placeholderTextColor={theme.textSecondary} value={departureTime} onChangeText={setDepartureTime} />
                </View>
                <View style={[s.row, { paddingTop: 10 }]}>
                  <Text style={s.rowLabel}>Needs a pickup</Text>
                  <Switch value={pickupNeeded} onValueChange={setPickupNeeded} trackColor={{ false: theme.border, true: theme.accent }} thumbColor={theme.bg} />
                </View>
                {pickupNeeded && (
                  <TextInput
                    style={s.input}
                    placeholder="Who's picking them up + contact info"
                    placeholderTextColor={theme.textSecondary}
                    value={pickupNotes}
                    onChangeText={setPickupNotes}
                  />
                )}
              </View>
            )}

            {/* Independent of the outstation toggle — a local guest can
                still be put up (large family, elderly relative). */}
            {eventAccommodations.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Accommodation</Text>
                <View style={s.chipsWrap}>
                  <TouchableOpacity style={[s.chip, !accommodationId && s.chipActive]} onPress={() => setAccommodationId(null)}>
                    <Text style={[s.chipText, !accommodationId && s.chipTextActive]}>None</Text>
                  </TouchableOpacity>
                  {eventAccommodations.map(acc => (
                    <TouchableOpacity
                      key={acc.id}
                      style={[s.chip, accommodationId === acc.id && s.chipActive]}
                      onPress={() => setAccommodationId(acc.id === accommodationId ? null : acc.id)}
                    >
                      <Text style={[s.chipText, accommodationId === acc.id && s.chipTextActive]}>{acc.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={s.input}
                  placeholder="Room number (optional)"
                  placeholderTextColor={theme.textSecondary}
                  value={roomNumber}
                  onChangeText={setRoomNumber}
                />
              </>
            )}

            {/* Read-only — guest-submitted via RSVPScreen.js's outstation
                flow, never host-edited/uploaded. Only appears when there's
                actually something to show, same "no empty state" principle
                as everything else in this file. */}
            {(guest.govt_id_doc_path || accompanying.length > 0) ? (
              <>
                <Text style={s.sectionLabel}>Government ID</Text>
                {guest.govt_id_doc_path ? (
                  <TouchableOpacity style={s.docViewRow} onPress={() => viewGovtId(guest.govt_id_doc_path)} disabled={viewingDocPath === guest.govt_id_doc_path}>
                    {viewingDocPath === guest.govt_id_doc_path
                      ? <ActivityIndicator size="small" color={theme.accent} />
                      : <Text style={s.docViewRowText}>🪪 View {guest.name}'s ID</Text>}
                  </TouchableOpacity>
                ) : null}
                {accompanying.map(a => (
                  <TouchableOpacity
                    key={a.id}
                    style={s.docViewRow}
                    onPress={() => a.govt_id_doc_path && viewGovtId(a.govt_id_doc_path)}
                    disabled={!a.govt_id_doc_path || viewingDocPath === a.govt_id_doc_path}
                  >
                    {viewingDocPath === a.govt_id_doc_path
                      ? <ActivityIndicator size="small" color={theme.accent} />
                      : <Text style={s.docViewRowText}>
                          {a.govt_id_doc_path ? `🪪 View ${a.name}'s ID` : `${a.name} — no ID uploaded yet`}
                        </Text>}
                  </TouchableOpacity>
                ))}
              </>
            ) : null}

            <Text style={s.sectionLabel}>Status</Text>
            <View style={s.statusBox}>
              <Text style={s.statusLine}>
                🪑 {guest.table_number ? `Table ${guest.table_number}` : 'Not assigned to a table yet — open Seating'}
              </Text>
              <Text style={s.statusLine}>
                ✉️ {guest.invite_sent_at ? `Invite sent ${timeAgo(guest.invite_sent_at)}` : 'Invite not sent yet'}
              </Text>
              {guest.gift_type ? (
                <Text style={s.statusLine}>
                  🙏 {guest.thank_you_sent_at ? `Thank-you sent ${timeAgo(guest.thank_you_sent_at)}` : 'Thank-you not sent yet'}
                </Text>
              ) : null}
              <View style={s.checkinRow}>
                <View>
                  <Text style={s.statusLine}>
                    {guest.checked_in_at ? `✓ Checked in ${timeAgo(guest.checked_in_at)}` : '○ Not checked in yet'}
                  </Text>
                  {guest.checked_in_at && guest.checkin_source === 'host_manual' ? (
                    <Text style={s.sourceTag}>logged by host</Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={toggleCheckIn} disabled={checkingIn}>
                  {checkingIn ? <ActivityIndicator size="small" color={theme.accent} /> : (
                    <Text style={s.checkinLink}>{guest.checked_in_at ? 'Undo' : 'Check in now'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {navigation && event ? (
              <TouchableOpacity
                style={s.gatePassLink}
                onPress={() => { onClose(); navigation.navigate('GatePass', { eventId: event.id }); }}
              >
                <Text style={s.gatePassLinkText}>🎫 Manage gate passes for this event</Text>
              </TouchableOpacity>
            ) : null}

            {onShareInvite ? (
              <TouchableOpacity style={s.gatePassLink} onPress={() => onShareInvite(guest)}>
                <Text style={s.gatePassLinkText}>✉️ Share invite via email / SMS / other</Text>
              </TouchableOpacity>
            ) : null}
            {onSendPass ? (
              <TouchableOpacity style={s.gatePassLink} onPress={() => onSendPass(guest)}>
                <Text style={s.gatePassLinkText}>🎫 Send this guest's pass</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={theme.bg} /> : <Text style={s.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function styles(theme) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 },
    modal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 24, gap: 4 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    householdBadge: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 6 },
    householdBadgeText: { fontSize: 12, fontWeight: '700' },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, marginTop: 14, marginBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
    rowLabel: { fontSize: 14, fontWeight: '600', color: theme.text },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 13, paddingVertical: 8, borderRadius: 16,
      backgroundColor: theme.bgSecondary, borderWidth: 0.5, borderColor: theme.border,
    },
    chipActive: { backgroundColor: theme.accent + '18', borderColor: theme.accent },
    chipText: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
    chipTextActive: { color: theme.accent },
    input: {
      backgroundColor: theme.bgSecondary, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: theme.text,
      borderWidth: 0.5, borderColor: theme.border, marginTop: 8,
    },
    travelBox: {
      backgroundColor: theme.bgSecondary, borderRadius: 12, padding: 12, gap: 8,
      borderWidth: 0.5, borderColor: theme.border, marginTop: 8,
    },
    travelFieldLabel: { fontSize: 11, fontWeight: '700', color: theme.textSecondary, marginTop: 2 },
    statusBox: {
      backgroundColor: theme.bgSecondary, borderRadius: 12, padding: 12, gap: 8,
      borderWidth: 0.5, borderColor: theme.border,
    },
    statusLine: { fontSize: 12.5, color: theme.text },
    docViewRow: {
      paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6,
      backgroundColor: theme.bgSecondary, borderWidth: 0.5, borderColor: theme.border,
    },
    docViewRowText: { fontSize: 12.5, fontWeight: '600', color: theme.text },
    // Deliberately subtle — this is context, not a warning. Small caption
    // under the badge it qualifies, not a competing UI element.
    sourceTag: { fontSize: 10.5, color: theme.textTertiary, fontStyle: 'italic', marginTop: 1 },
    checkinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    checkinLink: { fontSize: 12.5, fontWeight: '700', color: theme.accent },
    gatePassLink: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
    gatePassLinkText: { fontSize: 12.5, fontWeight: '600', color: theme.accent },
    saveBtn: { backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
    saveBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
  });
}
