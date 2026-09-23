// Asks the phone to show its built-in "Rate Utsav" popup (the native
// App Store / Play Store review sheet — not a custom screen we build).
// Fires at most once, ever, per install, and only from a moment that just
// went well for the person (e.g. right after a guest is checked in at the
// gate). Both Apple and Google also independently throttle how often the
// real popup can appear, so calling this is always safe even if we call it
// from more than one "good moment" in the app later.
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROMPTED_KEY = 'utsav_review_prompted_v1';

export async function maybePromptForReview() {
  try {
    const already = await AsyncStorage.getItem(PROMPTED_KEY);
    if (already) return;
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;
    await AsyncStorage.setItem(PROMPTED_KEY, '1');
    await StoreReview.requestReview();
  } catch {
    // never let a review prompt failure interrupt the real flow it's called from
  }
}
