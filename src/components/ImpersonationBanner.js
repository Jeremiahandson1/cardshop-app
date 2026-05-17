// Always-visible bar shown app-wide while acting as another user.
// Self-contained, literal styles (no theme import so it can't be
// the thing that crashes), absolute-positioned over the top so it
// never disturbs navigator layout. One tap = stop impersonating.

import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';

export default function ImpersonationBanner() {
  const impersonating = useAuthStore((s) => s.impersonating);
  const stop = useAuthStore((s) => s.stopImpersonating);
  const [busy, setBusy] = React.useState(false);
  if (!impersonating) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 99999, elevation: 99999,
      }}
    >
      <View style={{
        backgroundColor: '#a78bfa',
        paddingTop: Platform.OS === 'ios' ? 52 : 28,
        paddingBottom: 8, paddingHorizontal: 14,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
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
    </View>
  );
}
