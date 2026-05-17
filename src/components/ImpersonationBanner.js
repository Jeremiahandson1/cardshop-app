// In-flow bar shown app-wide while acting as another user.
// NOT absolute/overlay — it occupies real layout space at the
// very top so it never covers headers, back buttons, or screen
// controls (App.js renders it above a flex:1 navigator). Renders
// null when not impersonating, so normal layout is untouched.
// Literal styles + safe-area inset so it sits under the status
// bar cleanly. One tap = stop impersonating.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';

export default function ImpersonationBanner() {
  const impersonating = useAuthStore((s) => s.impersonating);
  const stop = useAuthStore((s) => s.stopImpersonating);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = React.useState(false);
  if (!impersonating) return null;

  return (
    <View style={{
      backgroundColor: '#a78bfa',
      paddingTop: insets.top + 6,
      paddingBottom: 8,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    }}>
      <Text style={{ color: '#0a0a0f', fontWeight: '800', fontSize: 12, flex: 1 }} numberOfLines={1}>
        Acting as @{impersonating.asUsername} — actions logged
      </Text>
      <TouchableOpacity
        disabled={busy}
        onPress={async () => { setBusy(true); try { await stop(); } finally { setBusy(false); } }}
        style={{
          backgroundColor: '#0a0a0f', borderRadius: 6,
          paddingHorizontal: 12, paddingVertical: 5, opacity: busy ? 0.5 : 1,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
          {busy ? 'Stopping…' : 'Stop'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
