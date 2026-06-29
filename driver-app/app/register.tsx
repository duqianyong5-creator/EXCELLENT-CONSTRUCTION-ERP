import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { authApi } from '../src/api';
import { useLang } from '../src/i18n';
import { showAppAlert } from '../src/AppDialog';

const AMBER = '#F59E0B';
const AMBER_DARK = '#D97706';
const MUTED = '#9ca3af';

function Field({ icon, name, focused, setFocused, ...props }: any) {
  return (
    <View style={[styles.inputWrap, focused === name && styles.inputWrapFocused]}>
      <Ionicons name={icon} size={20} color={MUTED} />
      <TextInput
        style={styles.input}
        placeholderTextColor={MUTED}
        onFocus={() => setFocused(name)}
        onBlur={() => setFocused(null)}
        {...props}
      />
    </View>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', fullName: '', phone: '', password: '' });
  const [role, setRole] = useState<'driver' | 'client' | ''>('');
  const [focused, setFocused] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (form.username.trim().length < 3) return showAppAlert(t('reg.notice'), t('reg.tipUsername'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return showAppAlert(t('reg.notice'), t('reg.tipEmail'));
    if (!form.fullName.trim()) return showAppAlert(t('reg.notice'), t('reg.tipFullName'));
    if (!role) return showAppAlert(t('reg.notice'), t('reg.tipRole'));
    if (form.password.length < 8) return showAppAlert(t('reg.notice'), t('reg.tipPassword'));
    try {
      setLoading(true);
      await authApi.register({
        username: form.username.trim(),
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || undefined,
        role,
        password: form.password,
      });
      setSuccess(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || t('reg.failed');
      showAppAlert(t('reg.failed'), typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={[styles.bg, { justifyContent: 'center', padding: 20 }]}>
        <View style={styles.card}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={44} color="#fff" />
          </View>
          <Text style={styles.title}>{t('reg.successTitle')}</Text>
          <Text style={styles.subtitle}>{t('reg.successDesc')}</Text>
          <TouchableOpacity style={styles.submitBtn} onPress={() => router.replace('/login')} activeOpacity={0.85}>
            <Text style={styles.submitText}>{t('reg.backLogin')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.bg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Image source={require('../assets/log.png')} style={styles.logo} resizeMode="cover" />
            <Text style={styles.title}>{t('reg.title')}</Text>
            <Text style={styles.subtitle}>{t('reg.subtitle')}</Text>
          </View>

          <Field icon="person-outline" placeholder={t('reg.usernamePh')} value={form.username}
            onChangeText={(v: string) => set('username', v)} name="username" focused={focused} setFocused={setFocused} autoCapitalize="none" />
          <Field icon="mail-outline" placeholder={t('reg.emailPh')} value={form.email}
            onChangeText={(v: string) => set('email', v)} name="email" focused={focused} setFocused={setFocused} keyboardType="email-address" autoCapitalize="none" />
          <Field icon="id-card-outline" placeholder={t('reg.fullNamePh')} value={form.fullName}
            onChangeText={(v: string) => set('fullName', v)} name="fullName" focused={focused} setFocused={setFocused} />
          <Field icon="call-outline" placeholder={t('reg.phonePh')} value={form.phone}
            onChangeText={(v: string) => set('phone', v)} name="phone" focused={focused} setFocused={setFocused} keyboardType="phone-pad" />

          <Text style={styles.roleLabel}>{t('reg.role')}</Text>
          <View style={styles.roleRow}>
            <TouchableOpacity style={[styles.roleBtn, role === 'driver' && styles.roleBtnActive]} onPress={() => setRole('driver')}>
              <Text style={[styles.roleText, role === 'driver' && styles.roleTextActive]}>{t('reg.roleDriver')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.roleBtn, role === 'client' && styles.roleBtnActive]} onPress={() => setRole('client')}>
              <Text style={[styles.roleText, role === 'client' && styles.roleTextActive]}>{t('reg.roleClient')}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.inputWrap, focused === 'password' && styles.inputWrapFocused, { marginTop: 14 }]}>
            <Ionicons name="lock-closed-outline" size={20} color={MUTED} />
            <TextInput style={styles.input} placeholder={t('reg.passwordPh')} placeholderTextColor={MUTED}
              value={form.password} onChangeText={(v) => set('password', v)} secureTextEntry={!showPassword}
              onFocus={() => setFocused('password')} onBlur={() => setFocused(null)} />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={MUTED} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('reg.submit')}</Text>}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('reg.haveAccount')}</Text>
            <TouchableOpacity onPress={() => router.replace('/login')}>
              <Text style={styles.footerLink}>{t('reg.backLogin')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 28,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 12,
  },
  header: { alignItems: 'center', marginBottom: 22 },
  logo: { width: 84, height: 84, borderRadius: 42, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 4, textAlign: 'center' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, marginBottom: 14, backgroundColor: '#fff',
  },
  inputWrapFocused: { borderColor: AMBER },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#0f172a' },
  roleLabel: { fontSize: 13, color: '#475569', fontWeight: '600', marginBottom: 8 },
  roleRow: { flexDirection: 'row', gap: 12 },
  roleBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#fff',
  },
  roleBtnActive: { borderColor: AMBER, backgroundColor: '#FEF6E7' },
  roleText: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  roleTextActive: { color: AMBER_DARK },
  submitBtn: {
    height: 50, borderRadius: 12, backgroundColor: AMBER,
    alignItems: 'center', justifyContent: 'center', marginTop: 22,
    shadowColor: AMBER, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  footerText: { color: '#94a3b8', fontSize: 13 },
  footerLink: { color: AMBER, fontSize: 13, fontWeight: '700' },
  successIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#22c55e',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 18,
  },
});
