// Shared navigation ref for code outside the component tree (api
// interceptors, push handlers, etc.) that needs to trigger a
// navigation. Wired up by RootNavigator's <NavigationContainer
// ref={navigationRef} />.
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function safeNavigate(name, params) {
  try {
    if (navigationRef.isReady?.()) {
      navigationRef.navigate(name, params);
      return true;
    }
  } catch (e) {
    console.warn('[nav] safeNavigate failed', e?.message);
  }
  return false;
}
