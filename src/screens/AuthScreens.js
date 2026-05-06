import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showMessage } from 'react-native-flash-message';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../services/api';
import { Button, Input } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// LOGIN
// ============================================================
export const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef();
  const totpRef = useRef();
  const login = useAuthStore((s) => s.login);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    if (totpRequired && !totpCode) {
      setError('2FA code required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await login(
        email.toLowerCase().trim(),
        password,
        totpCode || undefined,
      );
      // Signing in during the 30-day grace window cancels a pending deletion;
      // the server signals that via `deletion_cancelled` on the login response.
      if (result?.deletion_cancelled) {
        showMessage({
          message: 'Welcome back — we cancelled the pending deletion of your account.',
          type: 'success',
          duration: 4500,
        });
      }
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'totp_required') {
        setTotpRequired(true);
        setError('');
        // Focus the TOTP field in the next render
        setTimeout(() => totpRef.current?.focus?.(), 100);
        setLoading(false);
        return;
      }
      if (code === 'totp_invalid') {
        setTotpRequired(true);
        setError('That 2FA code is incorrect.');
        setLoading(false);
        return;
      }
      // Verbose error surfacing while we diagnose the "login failed" report.
      const parts = [];
      if (err.response?.data?.error) parts.push(err.response.data.error);
      else {
        parts.push('Login failed.');
        if (err.code) parts.push('code=' + err.code);
        if (err.message) parts.push(String(err.message).slice(0, 120));
        if (err.response?.status) parts.push('http=' + err.response.status);
        if (!err.response && err.request) parts.push('request never returned');
      }
      setError(parts.join(' · '));
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
              returnKeyType={totpRequired ? 'next' : 'done'}
              onSubmitEditing={totpRequired ? () => totpRef.current?.focus?.() : handleLogin}
              inputRef={passwordRef}
            />

            {totpRequired ? (
              <Input
                label="2FA code"
                value={totpCode}
                onChangeText={setTotpCode}
                placeholder="6-digit code or backup code"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                inputRef={totpRef}
              />
            ) : null}

            <Button
              title={totpRequired ? 'Verify & sign in' : 'Sign In'}
              onPress={handleLogin}
              loading={loading}
              style={{ marginTop: Spacing.sm }}
            />

            <TouchableOpacity
              style={styles.forgotLink}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

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
    email: '', username: '', password: '', display_name: '', role: 'collector',
    date_of_birth: '',
  });
  // DOB collected as three discrete fields so a US user can type
  // 06 / 14 / 1992 in their natural mental order. The combined
  // ISO date (YYYY-MM-DD) is what the API stores; we assemble it
  // on submit.
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobYear, setDobYear] = useState('');
  const dobMonthRef = useRef();
  const dobDayRef = useRef();
  const dobYearRef = useRef();
  // Age confirmation — required for COPPA without forcing a
  // specific DOB. Apple Review 5.1.1(v) flagged required DOB
  // as a privacy violation, so we collect just the boolean.
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const register = useAuthStore((s) => s.register);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const ageYearsFromDob = (dob) => {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    const ms = Date.now() - d.getTime();
    return ms / (1000 * 60 * 60 * 24 * 365.25);
  };

  const handleRegister = async () => {
    if (!form.email || !form.username || !form.password) {
      setError('Email, username, and password are required');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    // Age verification only — no DOB collected. Apple flagged
    // mandatory DOB as a 5.1.1(v) privacy violation since it
    // isn't directly relevant to core functionality. We keep an
    // age-confirm checkbox to satisfy COPPA without storing the
    // user's actual birthday. Optional DOB field exists below
    // for users who want birthday rewards later.
    if (!ageConfirmed) {
      setError('Please confirm you are at least 13 years old.');
      return;
    }
    // Optional DOB: validate IF the user filled all three fields.
    // Empty = skip entirely. Partial = treat as filled-in error.
    let isoDob = null;
    const anyDob = dobMonth || dobDay || dobYear;
    if (anyDob) {
      const m = parseInt(dobMonth, 10);
      const d = parseInt(dobDay, 10);
      const y = parseInt(dobYear, 10);
      if (!m || !d || !y) {
        setError('Date of birth is optional, but if you start it, fill all three fields.');
        return;
      }
      if (m < 1 || m > 12) { setError('Month must be 1\u201312'); return; }
      if (d < 1 || d > 31) { setError('Day must be 1\u201331'); return; }
      if (y < 1900 || y > new Date().getFullYear()) { setError('Year looks wrong'); return; }
      const dt = new Date(y, m - 1, d);
      if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
        setError('That date doesn\u2019t exist on the calendar');
        return;
      }
      isoDob = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const age = ageYearsFromDob(isoDob);
      if (age != null && age < 13) {
        setError('You must be at least 13 to use Card Shop.');
        return;
      }
    }
    form.date_of_birth = isoDob;
    if (!agreed) {
      setError('You must agree to the Terms of Service and Privacy Policy.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register({
        ...form,
        email: form.email.toLowerCase().trim(),
        username: form.username.trim(),
        age_confirmed: ageConfirmed,
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const age = ageYearsFromDob(form.date_of_birth);

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
            {/* Age confirmation — required to comply with COPPA
                without storing a specific DOB. Apple flagged
                required DOB as 5.1.1(v) privacy violation. */}
            <TouchableOpacity
              style={styles.tosRow}
              onPress={() => setAgeConfirmed((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={[styles.tosCheckbox, ageConfirmed && styles.tosCheckboxOn]}>
                {ageConfirmed ? <Text style={styles.tosCheckboxMark}>{'\u2713'}</Text> : null}
              </View>
              <Text style={styles.tosText}>
                I confirm I am at least 13 years old.
              </Text>
            </TouchableOpacity>

            {/* Optional DOB — for birthday rewards / age-gated
                features later. Skipping all three fields = no
                DOB stored. Partial entry triggers a validation
                hint at submit time. */}
            <Text style={{
              fontSize: 13, color: Colors.textMuted, fontWeight: '600',
              marginBottom: 6, marginTop: Spacing.md, letterSpacing: 0.5,
            }}>
              DATE OF BIRTH (OPTIONAL)
            </Text>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
              <View style={{ flex: 1 }}>
                <Input
                  inputRef={dobMonthRef}
                  label="Month"
                  value={dobMonth}
                  onChangeText={(v) => {
                    const cleaned = v.replace(/\D/g, '').slice(0, 2);
                    setDobMonth(cleaned);
                    if (cleaned.length === 2) dobDayRef.current?.focus();
                  }}
                  placeholder="MM"
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  inputRef={dobDayRef}
                  label="Day"
                  value={dobDay}
                  onChangeText={(v) => {
                    const cleaned = v.replace(/\D/g, '').slice(0, 2);
                    setDobDay(cleaned);
                    if (cleaned.length === 2) dobYearRef.current?.focus();
                  }}
                  placeholder="DD"
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <Input
                  inputRef={dobYearRef}
                  label="Year"
                  value={dobYear}
                  onChangeText={(v) => setDobYear(v.replace(/\D/g, '').slice(0, 4))}
                  placeholder="YYYY"
                  keyboardType="number-pad"
                />
              </View>
            </View>

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

            {/* ToS + Privacy agreement — required */}
            <TouchableOpacity
              style={styles.tosRow}
              onPress={() => setAgreed(!agreed)}
              activeOpacity={0.7}
            >
              <View style={[styles.tosCheckbox, agreed && styles.tosCheckboxOn]}>
                {agreed ? <Text style={styles.tosCheckboxMark}>✓</Text> : null}
              </View>
              <Text style={styles.tosText}>
                I agree to the{' '}
                <Text
                  style={styles.tosLink}
                  onPress={() => Linking.openURL('https://cardshop.twomiah.com/terms')}
                >
                  Terms of Service
                </Text>
                {' '}and{' '}
                <Text
                  style={styles.tosLink}
                  onPress={() => Linking.openURL('https://cardshop.twomiah.com/privacy')}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </TouchableOpacity>

            <Button title="Create Account" onPress={handleRegister} loading={loading} disabled={!agreed} style={{ marginTop: Spacing.md }} />

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

// ============================================================
// FORGOT PASSWORD
// ============================================================
// The backend always returns 200 (no email enumeration). We just show a
// neutral "check your email" toast and pop back to Login. The emailed link
// points at the landing site — we don't implement a reset-receive flow in
// the app; the user signs in with the new password after they reset.
export const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const trimmed = email.toLowerCase().trim();
    if (!trimmed) {
      setError('Enter the email on your account');
      return;
    }
    setError('');
    setLoading(true);

    // Only the API call itself should be able to raise "couldn't send"
    // to the user. A throw from showMessage/navigation after the server
    // said 200 must NOT look like a send failure — the email was sent.
    let apiOk = false;
    try {
      await authApi.forgotPassword(trimmed);
      apiOk = true;
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send the reset email. Try again.');
    } finally {
      setLoading(false);
    }

    if (!apiOk) return;

    try {
      showMessage({
        message: 'Check your email for a reset link.',
        type: 'success',
        duration: 4000,
      });
    } catch { /* toast is best-effort */ }

    try { navigation.goBack(); } catch { /* same */ }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoArea}>
            <View style={styles.logoMark}>
              <Text style={styles.logoIcon}>🔑</Text>
            </View>
            <Text style={styles.logoTitle}>Reset password</Text>
            <Text style={styles.logoSub}>We'll email you a link</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.formTitle}>Forgot password</Text>
            <Text style={[styles.switchText, { marginBottom: Spacing.md }]}>
              Enter your account email. If it matches an account, we'll send a link to reset your password.
            </Text>

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
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
            />

            <Button
              title="Send reset link"
              onPress={handleSubmit}
              loading={loading}
              style={{ marginTop: Spacing.sm }}
            />

            <TouchableOpacity style={styles.switchLink} onPress={() => navigation.goBack()}>
              <Text style={styles.switchText}>
                Remembered it? <Text style={styles.switchAction}>Back to sign in</Text>
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
  forgotLink: { alignItems: 'center', marginTop: Spacing.md },
  forgotText: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.semibold },
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
  tosRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  tosCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tosCheckboxOn: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  tosCheckboxMark: {
    color: Colors.bg,
    fontSize: 14,
    fontWeight: Typography.bold,
    lineHeight: 16,
  },
  tosText: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: Typography.sm,
    lineHeight: 20,
  },
  tosLink: {
    color: Colors.accent,
    fontWeight: Typography.semibold,
    textDecorationLine: 'underline',
  },
});
