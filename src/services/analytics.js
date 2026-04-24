/**
 * Analytics wrapper around PostHog.
 *
 * Initialized once at app boot in App.js. Everywhere else, call:
 *   analytics.track('event_name', { property: value });
 *   analytics.identify(userId, { email, username, ... });
 *   analytics.reset();  // on logout
 *
 * Silently no-ops if EXPO_PUBLIC_POSTHOG_API_KEY isn't set — keeps
 * dev + CI clean while still letting builds flip analytics on via env.
 */

import PostHog from 'posthog-react-native';

let _client = null;

export async function initAnalytics() {
  const apiKey =
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY ||
    process.env.POSTHOG_API_KEY;
  if (!apiKey) return null;
  if (_client) return _client;

  try {
    _client = new PostHog(apiKey, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      flushAt: 20,
      flushInterval: 30000,
    });
    await _client.ready?.();
  } catch (err) {
    console.warn('posthog init failed', err?.message);
    _client = null;
  }
  return _client;
}

export const analytics = {
  track(event, props) {
    try { _client?.capture(event, props); } catch {}
  },
  identify(distinctId, props) {
    try { _client?.identify(distinctId, props); } catch {}
  },
  reset() {
    try { _client?.reset(); } catch {}
  },
};

// Canonical event names — use these instead of inline strings so
// renames are grep-able.
export const Events = {
  // Auth
  SIGNUP_COMPLETED: 'signup_completed',
  LOGIN: 'login',

  // Trade Board
  LISTING_CREATED: 'listing_created',
  LISTING_VIEWED: 'listing_viewed',
  LISTING_REMOVED: 'listing_removed',
  LISTING_BUMPED: 'listing_bumped',

  // Offers
  OFFER_SENT: 'offer_sent',
  OFFER_UPDATED: 'offer_updated',
  OFFER_ACCEPTED: 'offer_accepted',
  OFFER_DECLINED: 'offer_declined',
  OFFER_COUNTERED: 'offer_countered',
  OFFER_WITHDRAWN: 'offer_withdrawn',

  // Groups
  GROUP_CREATED: 'trade_group_created',
  GROUP_JOINED: 'trade_group_joined',
  GROUP_LEFT: 'trade_group_left',
  INVITE_CREATED: 'trade_group_invite_created',

  // LCS
  LCS_SHOP_VIEWED: 'lcs_shop_viewed',
  LCS_PRICE_POSTED: 'lcs_price_posted',
  LCS_PRICE_VERIFIED: 'lcs_price_verified',
  LCS_TREND_VIEWED: 'lcs_trend_viewed',

  // Set completion
  SET_VIEWED: 'set_viewed',
  WANT_LIST_ADD: 'want_list_add',

  // Safety
  USER_BLOCKED: 'user_blocked',
  STOLEN_REPORT_FILED: 'stolen_report_filed',
  SUPPORT_TICKET_FILED: 'support_ticket_filed',
};
