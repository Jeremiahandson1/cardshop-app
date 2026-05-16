// Top-level crash catcher. The app had NO error boundary — any
// render exception killed the app silently with no stack, which
// made the Show Floor crash impossible to diagnose remotely.
//
// On catch: (1) show the actual error + component stack on screen,
// selectable + copyable, (2) fire-and-forget POST to /client-log
// so the stack also lands in the server logs ([CLIENT-CRASH]),
// (3) offer "Try again" to reset and recover.
//
// Deliberately dependency-light and self-contained (literal
// styles, no theme import) so it can't itself crash while
// rendering the error for a theme/import-level failure.

import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Platform,
} from 'react-native';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { api } from '../services/api';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    const payload = {
      screen: this.props.screen || 'root',
      message: String(error && error.message ? error.message : error),
      stack: String(error && error.stack ? error.stack : ''),
      componentStack: String(info && info.componentStack ? info.componentStack : ''),
      platform: `${Platform.OS} ${Platform.Version}`,
      appVersion: Constants?.expoConfig?.version || 'unknown',
    };
    // Never let reporting throw.
    try {
      api.post('/client-log', payload).catch(() => {});
    } catch (_) { /* noop */ }
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const text = [
      `Message: ${error.message || error}`,
      '',
      'Stack:',
      error.stack || '(none)',
      '',
      'Component stack:',
      (info && info.componentStack) || '(none)',
    ].join('\n');

    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0f', paddingTop: 60, paddingHorizontal: 18 }}>
        <Text style={{ color: '#ef4444', fontSize: 20, fontWeight: '800', marginBottom: 6 }}>
          Something crashed
        </Text>
        <Text style={{ color: '#cccce0', fontSize: 13, marginBottom: 12 }}>
          The details below were also sent to the server. Copy and send them if asked.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => Clipboard.setStringAsync(text)}
            style={{ backgroundColor: '#e8c547', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
          >
            <Text style={{ color: '#0a0a0f', fontWeight: '800' }}>Copy details</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => this.setState({ error: null, info: null })}
            style={{ borderColor: '#2a2a3a', borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
          >
            <Text style={{ color: '#e8e8f0', fontWeight: '700' }}>Try again</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          <Text selectable style={{ color: '#8888aa', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
            {text}
          </Text>
        </ScrollView>
      </View>
    );
  }
}

export default ErrorBoundary;
