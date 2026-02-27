import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { Button, Input } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// LOGIN
// ============================================================
export const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef();
  const login = useAuthStore((s) => s.login);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.toLowerCase().trim(), password);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoArea}>
            <View style={styles.logoMark}>
              <Text style={styles.logoIcon}>🃏</Text>
            </View>
            <Text style={styles.logoTitle}>Card Shop</Text>
            <Text style={styles.logoSub}>by Twomiah</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.formTitle}>Welcome back</Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              inputRef={passwordRef}
            />

            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={loading}
              style={{ marginTop: Spacing.sm }}
            />

            <TouchableOpacity style={styles.switchLink} onPress={() => navigation.navigate('Register')}>
              <Text style={styles.switchText}>
                Don't have an account? <Text style={styles.switchAction}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ============================================================
// REGISTER
// ============================================================
export const RegisterScreen = ({ navigation }) => {
  const [form, setForm] = useState({
    email: '', username: '', password: '', display_name: '', role: 'collector'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const register = useAuthStore((s) => s.register);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const handleRegister = async () => {
    if (!form.email || !form.username || !form.password) {
      setError('Email, username, and password are required');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register(form);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoArea}>
            <View style={styles.logoMark}>
              <Text style={styles.logoIcon}>🃏</Text>
            </View>
            <Text style={styles.logoTitle}>Card Shop</Text>
            <Text style={styles.logoSub}>by Twomiah</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.formTitle}>Create account</Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Input label="Display Name" value={form.display_name} onChangeText={set('display_name')} placeholder="Your name" autoCapitalize="words" />
            <Input label="Username" value={form.username} onChangeText={set('username')} placeholder="cardkng99" />
            <Input label="Email" value={form.email} onChangeText={set('email')} placeholder="you@example.com" keyboardType="email-address" autoComplete="email" />
            <Input label="Password" value={form.password} onChangeText={set('password')} placeholder="8+ characters" secureTextEntry />

            {/* Role selector */}
            <Text style={styles.roleLabel}>I AM A</Text>
            <View style={styles.roleRow}>
              {['collector', 'store_owner'].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleBtn, form.role === r && styles.roleBtnActive]}
                  onPress={() => setForm((f) => ({ ...f, role: r }))}
                >
                  <Text style={[styles.roleBtnText, form.role === r && styles.roleBtnTextActive]}>
                    {r === 'collector' ? '👤 Collector' : '🏪 Store Owner'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button title="Create Account" onPress={handleRegister} loading={loading} style={{ marginTop: Spacing.md }} />

            <TouchableOpacity style={styles.switchLink} onPress={() => navigation.goBack()}>
              <Text style={styles.switchText}>
                Already have an account? <Text style={styles.switchAction}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, padding: Spacing.base },
  logoArea: { alignItems: 'center', paddingVertical: Spacing.xxxl },
  logoMark: {
    width: 72, height: 72, borderRadius: Radius.lg,
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  logoIcon: { fontSize: 36 },
  logoTitle: { color: Colors.text, fontSize: Typography.xxl, fontWeight: Typography.heavy, letterSpacing: -0.5 },
  logoSub: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.medium, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 },
  form: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
  },
  formTitle: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold, marginBottom: Spacing.lg },
  errorBox: { backgroundColor: '#ff6b6b22', borderWidth: 1, borderColor: Colors.accent3, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  errorText: { color: Colors.accent3, fontSize: Typography.sm },
  switchLink: { alignItems: 'center', marginTop: Spacing.lg },
  switchText: { color: Colors.textMuted, fontSize: Typography.sm },
  switchAction: { color: Colors.accent, fontWeight: Typography.semibold },
  roleLabel: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: Spacing.sm },
  roleRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  roleBtn: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface2, alignItems: 'center',
  },
  roleBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' },
  roleBtnText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.medium },
  roleBtnTextActive: { color: Colors.accent, fontWeight: Typography.semibold },
});
