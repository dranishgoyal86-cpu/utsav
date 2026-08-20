import { Platform } from 'react-native';
import { callEdgeFunction } from './helpers';
import { RAZORPAY_CONFIG } from './config';

// Native-only SDK — opens Razorpay's in-app checkout modal. On web we load
// their hosted checkout.js script instead (see loadWebCheckoutScript below).
let RazorpayCheckout;
if (Platform.OS !== 'web') {
  RazorpayCheckout = require('react-native-razorpay').default;
}

export async function createRazorpayOrder(bookingId) {
  return callEdgeFunction('create-razorpay-order', { bookingId });
}

// Injects Razorpay's web checkout script once and reuses it — cheaper than
// re-fetching it on every payment attempt within the same session.
let webCheckoutScriptPromise = null;
function loadWebCheckoutScript() {
  if (window.Razorpay) return Promise.resolve();
  if (webCheckoutScriptPromise) return webCheckoutScriptPromise;
  webCheckoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Razorpay checkout — check your connection.'));
    document.body.appendChild(script);
  });
  return webCheckoutScriptPromise;
}

// Opens Razorpay checkout (native modal or web overlay) and resolves with
// the fields verifyPayment() needs to confirm the payment server-side. Throws
// an Error with code 'PAYMENT_CANCELLED' if the user backs out — callers rely
// on that code to distinguish "cancelled" from "actually failed".
export async function initiatePayment({
  orderId,
  amount,
  bookingId,
  customerName,
  customerEmail,
  customerPhone,
  description,
}) {
  const options = {
    key: RAZORPAY_CONFIG.keyId,
    amount: Math.round(amount * 100),
    currency: RAZORPAY_CONFIG.currency,
    name: RAZORPAY_CONFIG.appName,
    description,
    order_id: orderId,
    prefill: { name: customerName, email: customerEmail, contact: customerPhone },
    theme: { color: '#E8A020' },
  };

  if (Platform.OS === 'web') {
    await loadWebCheckoutScript();
    return new Promise((resolve, reject) => {
      const rzp = new window.Razorpay({
        ...options,
        handler: (response) => resolve({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        }),
        modal: {
          ondismiss: () => {
            const err = new Error('Payment cancelled');
            err.code = 'PAYMENT_CANCELLED';
            reject(err);
          },
        },
      });
      rzp.on('payment.failed', (resp) => {
        const err = new Error(resp.error?.description || 'Payment failed');
        err.description = resp.error?.description;
        reject(err);
      });
      rzp.open();
    });
  }

  try {
    const data = await RazorpayCheckout.open(options);
    return {
      razorpay_order_id: data.razorpay_order_id,
      razorpay_payment_id: data.razorpay_payment_id,
      razorpay_signature: data.razorpay_signature,
    };
  } catch (err) {
    // react-native-razorpay rejects with { code, description } — code 0 (iOS)
    // or 2 (Android) means the user dismissed the checkout themselves.
    const cancelled = err.code === 0 || err.code === 2 || /cancel/i.test(err.description || err.message || '');
    if (cancelled) {
      const cancelErr = new Error('Payment cancelled');
      cancelErr.code = 'PAYMENT_CANCELLED';
      throw cancelErr;
    }
    const paymentErr = new Error(err.description || 'Payment failed');
    paymentErr.description = err.description;
    throw paymentErr;
  }
}

export async function verifyPayment({
  bookingId,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) {
  return callEdgeFunction('verify-razorpay-payment', {
    bookingId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });
}
