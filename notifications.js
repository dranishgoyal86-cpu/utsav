import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  // Web push was never actually built here — no VAPID key, no service
  // worker to receive a background push. Device.isDevice alone doesn't
  // exclude web (a real browser reports true, same as a physical phone),
  // so without this it silently ran on every web login: a real "Allow
  // notifications?" prompt for nothing, then getExpoPushTokenAsync()
  // throwing on the missing vapidPublicKey (an unhandled rejection —
  // this is what showed up as 40 Sentry events, not a blocking error).
  if (Platform.OS === 'web') return null;

  if (!Device.isDevice) {
    console.log('Push notifications only work on real devices');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Utsav',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E8A020',
    });
  }

  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}

export async function savePushToken(token) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !token) return;
    await supabase
      .from('users')
      .update({ push_token: token })
      .eq('id', session.user.id);
    console.log('Push token saved:', token);
  } catch (err) {
    console.log('Save token error:', err.message);
  }
}

export async function sendPushNotification(pushToken, title, body, data = {}) {
  if (!pushToken) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
      }),
    });
  } catch (err) {
    console.log('Send notification error:', err.message);
  }
}

export async function saveNotificationToDb(userId, title, body, data = {}) {
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      title,
      body,
      data,
    });
  } catch (err) {
    console.log('Save notification error:', err.message);
  }
}

export async function notifyBookingConfirmed(customerId, providerName, eventType, bookingId) {
  const { data: customer } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', customerId)
    .single();

  const title = 'Booking confirmed! 🎉';
  const body = `${providerName} has confirmed your ${eventType} booking.`;

  await saveNotificationToDb(customerId, title, body, { type: 'booking_confirmed', booking_id: bookingId });
  if (customer?.push_token) {
    await sendPushNotification(customer.push_token, title, body);
  }
}

export async function notifyNewBooking(providerId, customerName, eventType, bookingId) {
  const { data: provider } = await supabase
    .from('providers')
    .select('user_id')
    .eq('id', providerId)
    .single();

  if (!provider) return;

  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', provider.user_id)
    .single();

  const title = 'New booking request! 📅';
  const body = `${customerName} wants to book you for a ${eventType}.`;

  await saveNotificationToDb(provider.user_id, title, body, { type: 'new_booking', booking_id: bookingId });
  if (user?.push_token) {
    await sendPushNotification(user.push_token, title, body);
  }
}

// Sent to a provider with a confirmed booking when the host forces an event
// date change (hooks/useEventContext.js's update() calls this once per
// affected booking after the write succeeds, never before).
export async function notifyEventDateChanged(providerId, eventName, oldDate, newDate, bookingId) {
  const { data: provider } = await supabase
    .from('providers')
    .select('user_id')
    .eq('id', providerId)
    .single();

  if (!provider) return;

  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', provider.user_id)
    .single();

  const title = 'Event date changed 📅';
  const body = `${eventName || 'An event'} you're booked for moved from ${oldDate} to ${newDate}.`;

  await saveNotificationToDb(provider.user_id, title, body, { type: 'event_date_changed', booking_id: bookingId });
  if (user?.push_token) {
    await sendPushNotification(user.push_token, title, body);
  }
}

export async function notifyBookingDeclined(customerId, providerName, eventType, bookingId) {
  const { data: customer } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', customerId)
    .single();

  const title = 'Booking update';
  const body = `${providerName} is unavailable for your ${eventType} booking.`;

  await saveNotificationToDb(customerId, title, body, { type: 'booking_declined', booking_id: bookingId });
  if (customer?.push_token) {
    await sendPushNotification(customer.push_token, title, body);
  }
}

// Sent to the OTHER side of a booking (host or provider, whichever didn't
// just tap the button) when one side confirms service was delivered — the
// mutual-confirmation fast path in BookingsScreen.js / ProviderERP.js.
// Distinct from notifyBookingCompleted below: this fires once per
// confirmation tap, that one fires once, when both sides (or the safety-net
// cron) actually flip status to 'completed'.
export async function notifyServiceConfirmed(recipientUserId, confirmerLabel, eventType, bookingId) {
  const { data: recipient } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', recipientUserId)
    .single();

  const title = 'Service delivery confirmed';
  const body = `${confirmerLabel} confirmed your ${eventType} booking is complete. Confirm on your end too to close it out.`;

  await saveNotificationToDb(recipientUserId, title, body, { type: 'service_confirmed', booking_id: bookingId });
  if (recipient?.push_token) {
    await sendPushNotification(recipient.push_token, title, body);
  }
}

// Fired once, when a booking actually reaches 'completed' — via mutual
// confirmation, or the auto-complete-bookings safety-net cron job (which
// calls this indirectly is NOT wired — the cron runs server-side with no
// per-booking push loop today; this is only called from the two client-side
// confirm actions for now, each notifying the OTHER side of the outcome).
export async function notifyBookingCompleted(recipientUserId, eventType, bookingId) {
  const { data: recipient } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', recipientUserId)
    .single();

  const title = 'Booking completed ✓';
  const body = `Your ${eventType} booking is now marked complete.`;

  await saveNotificationToDb(recipientUserId, title, body, { type: 'booking_completed', booking_id: bookingId });
  if (recipient?.push_token) {
    await sendPushNotification(recipient.push_token, title, body);
  }
}

// Sent to the OTHER side when either host or provider raises a dispute —
// freezes the booking (no auto-complete) until an admin resolves it.
export async function notifyDisputeRaised(recipientUserId, raisedByLabel, eventType, bookingId) {
  const { data: recipient } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', recipientUserId)
    .single();

  const title = 'A dispute was raised';
  const body = `${raisedByLabel} raised an issue with your ${eventType} booking. Our team will review it.`;

  await saveNotificationToDb(recipientUserId, title, body, { type: 'dispute_raised', booking_id: bookingId });
  if (recipient?.push_token) {
    await sendPushNotification(recipient.push_token, title, body);
  }
}

export async function notifyNewMessage(receiverId, senderName, bookingId) {
  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', receiverId)
    .single();

  const title = `New message from ${senderName}`;
  const body = 'Tap to view and reply';

  await saveNotificationToDb(receiverId, title, body, { type: 'new_message', booking_id: bookingId });
  if (user?.push_token) {
    await sendPushNotification(user.push_token, title, body);
  }
}

export async function notifyPaymentReceived(providerId, amount, eventType, bookingId) {
  const { data: provider } = await supabase
    .from('providers')
    .select('user_id')
    .eq('id', providerId)
    .single();

  if (!provider) return;

  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', provider.user_id)
    .single();

  const title = 'Payment received! 💰';
  const body = `₹${amount.toLocaleString()} received for ${eventType} booking.`;

  await saveNotificationToDb(provider.user_id, title, body, { type: 'payment_received', booking_id: bookingId });
  if (user?.push_token) {
    await sendPushNotification(user.push_token, title, body);
  }
}

export async function notifyTodoCompleted(userId, eventName, itemTitle, eventId) {
  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', userId)
    .single();

  const title = 'Checklist updated ✅';
  const body = `"${itemTitle}" completed for ${eventName}`;

  await saveNotificationToDb(userId, title, body, { type: 'todo_completed', event_id: eventId });
  if (user?.push_token) {
    await sendPushNotification(user.push_token, title, body);
  }
}

export async function notifyInvoiceGenerated(bookingId, invoiceNumber, total) {
  const { data: booking } = await supabase
    .from('bookings')
    .select('customer_id')
    .eq('id', bookingId)
    .single();

  if (!booking) return;

  const { data: customer } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', booking.customer_id)
    .single();

  const title = 'New invoice 🧾';
  const body = `Invoice ${invoiceNumber} for ₹${total.toLocaleString()} is ready.`;

  await saveNotificationToDb(booking.customer_id, title, body, { type: 'invoice_generated', booking_id: bookingId });
  if (customer?.push_token) {
    await sendPushNotification(customer.push_token, title, body);
  }
}

export async function notifyProviderVerified(userId) {
  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', userId)
    .single();

  const title = 'Profile verified! ✓';
  const body = 'Your provider profile has been verified. You are now visible to customers.';

  await saveNotificationToDb(userId, title, body, { type: 'provider_verified' });
  if (user?.push_token) {
    await sendPushNotification(user.push_token, title, body);
  }
}

// Provider verification, Task 3 (GST review). Mirrors notifyProviderVerified
// one-for-one, for the separate GST-specific admin queue (GSTReview.js).
export async function notifyGstReviewed(userId, approved) {
  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', userId)
    .single();

  const title = approved ? 'GST verified ✓' : 'GST verification needs another look';
  const body = approved
    ? 'Your GSTIN has been verified against the public GST record.'
    : 'Your GST submission was not approved — check your Business Profile for details and resubmit.';

  await saveNotificationToDb(userId, title, body, { type: 'gst_reviewed' });
  if (user?.push_token) {
    await sendPushNotification(user.push_token, title, body);
  }
}

export async function notifyAccountSuspended(userId, reason) {
  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', userId)
    .single();

  const title = 'Account suspended';
  const body = reason
    ? `Your account has been suspended: ${reason}`
    : 'Your account has been suspended. Contact support for details.';

  await saveNotificationToDb(userId, title, body, { type: 'account_suspended' });
  if (user?.push_token) {
    await sendPushNotification(user.push_token, title, body);
  }
}

// No real outbound-email mechanism exists anywhere in this codebase --
// confirmed by grepping for Resend/SendGrid/nodemailer/SMTP and by reading
// every existing "notify a user of something" edge function/reminder job
// (birthday-wishes, rsvp-reminders, todo-reminders): every one of them
// writes to `notifications` + an Expo push, none send email. Following
// that same established pattern rather than building a new email pipeline
// blind (no provider account/API key exists to build one against -- same
// credential-blocked shape as the Razorpay/SMS-OTP gaps in CLAUDE.md).
export async function notifyImportCategoryMismatch(userId, excludedCount, categoryLabel) {
  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', userId)
    .single();

  const title = 'Some imported services need a category change';
  const body = excludedCount === 1
    ? `1 imported service didn't match your account's category (${categoryLabel}). Review it in the import summary.`
    : `${excludedCount} imported services didn't match your account's category (${categoryLabel}). Review them in the import summary.`;

  await saveNotificationToDb(userId, title, body, { type: 'import_category_mismatch' });
  if (user?.push_token) {
    await sendPushNotification(user.push_token, title, body);
  }
}

export async function notifyAccountReactivated(userId) {
  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', userId)
    .single();

  const title = 'Account reactivated ✓';
  const body = 'Your account has been reactivated. You can log in again.';

  await saveNotificationToDb(userId, title, body, { type: 'account_reactivated' });
  if (user?.push_token) {
    await sendPushNotification(user.push_token, title, body);
  }
}