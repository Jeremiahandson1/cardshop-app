// RevenueCat (in-app purchase) bootstrap.
//
// Why we use it: Apple requires StoreKit for digital subscriptions
// sold inside the app, Google requires Play Billing. RevenueCat
// wraps both with one SDK, handles receipt validation server-side,
// and webhooks our backend when a user's entitlement changes so we
// can update users.subscription_tier without writing receipt code.
//
// Three things this file owns:
//   1. configureRevenueCat() — runs once at app start; safe no-op
//      if no API key is set (dev/Expo Go, web).
//   2. linkRevenueCatUser(userId) — call right after login so the
//      anonymous purchaser id gets aliased to the real account.
//   3. unlinkRevenueCatUser() — call on logout.
//
// Web (RN Web / Expo dev tools) is intentionally a no-op; the SDK
// throws on import in non-native runtimes. We guard with Platform.OS.

import { Platform } from 'react-native';
import Constants from 'expo-constants';

let _purchases = null;
let _configured = false;

function getPurchases() {
  if (_purchases) return _purchases;
  if (Platform.OS === 'web') return null;
  try {
    // Lazy require so web/dev environments don't try to load the
    // native module and crash.
    // eslint-disable-next-line global-require
    _purchases = require('react-native-purchases').default;
    return _purchases;
  } catch (err) {
    console.warn('[revenuecat] SDK not available:', err.message);
    return null;
  }
}

function getApiKey() {
  // Configured via app.json `extra` block so EAS env handles
  // dev / preview / production swaps without code changes.
  const extra = Constants.expoConfig?.extra || {};
  if (Platform.OS === 'ios') return extra.REVENUECAT_IOS_KEY || null;
  if (Platform.OS === 'android') return extra.REVENUECAT_ANDROID_KEY || null;
  return null;
}

export function isAvailable() {
  return Platform.OS !== 'web' && !!getApiKey();
}

// Idempotent — safe to call from multiple hooks/screens.
export async function configureRevenueCat() {
  if (_configured) return true;
  const Purchases = getPurchases();
  const apiKey = getApiKey();
  if (!Purchases || !apiKey) {
    if (Platform.OS !== 'web') {
      console.log('[revenuecat] not configured (no API key for', Platform.OS + ')');
    }
    return false;
  }
  try {
    Purchases.setLogLevel?.('warn');
    await Purchases.configure({ apiKey });
    _configured = true;
    return true;
  } catch (err) {
    console.warn('[revenuecat] configure failed:', err.message);
    return false;
  }
}

// Tie the anonymous RevenueCat user to our backend user_id so when
// the webhook fires we can look up the user to update.
export async function linkRevenueCatUser(userId) {
  const Purchases = getPurchases();
  if (!Purchases || !_configured || !userId) return;
  try {
    await Purchases.logIn(String(userId));
  } catch (err) {
    console.warn('[revenuecat] logIn failed:', err.message);
  }
}

export async function unlinkRevenueCatUser() {
  const Purchases = getPurchases();
  if (!Purchases || !_configured) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    console.warn('[revenuecat] logOut failed:', err.message);
  }
}

// Returns the active offering (the "Default offering" you set up
// in RevenueCat — packages: monthly, etc.). Null if anything fails
// or the platform isn't supported.
export async function getCurrentOffering() {
  const Purchases = getPurchases();
  if (!Purchases || !_configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings?.current || null;
  } catch (err) {
    console.warn('[revenuecat] getOfferings failed:', err.message);
    return null;
  }
}

// Initiates the system StoreKit / Play Billing purchase flow for
// the given Package. Returns { ok: true, customerInfo } on success
// or { ok: false, reason } on cancellation/failure.
export async function purchasePackage(pkg) {
  const Purchases = getPurchases();
  if (!Purchases || !_configured) return { ok: false, reason: 'sdk_unavailable' };
  try {
    const result = await Purchases.purchasePackage(pkg);
    return { ok: true, customerInfo: result.customerInfo };
  } catch (err) {
    if (err.userCancelled) return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: err.message || 'purchase_failed' };
  }
}

// True if the user currently has the `pro` entitlement active.
// Useful for client-side gating — backend remains source of truth
// via the subscription_tier column.
export async function hasProEntitlement() {
  const Purchases = getPurchases();
  if (!Purchases || !_configured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return !!info?.entitlements?.active?.pro;
  } catch (err) {
    return false;
  }
}

export async function restorePurchases() {
  const Purchases = getPurchases();
  if (!Purchases || !_configured) return { ok: false, reason: 'sdk_unavailable' };
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { ok: true, customerInfo };
  } catch (err) {
    return { ok: false, reason: err.message || 'restore_failed' };
  }
}
