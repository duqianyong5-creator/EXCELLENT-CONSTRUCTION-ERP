import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDispatch } from 'react-redux';
import * as SecureStore from 'expo-secure-store';
import { authApi, getBaseUrl } from '../src/api';
import { setCredentials } from '../src/store/authSlice';
import { useLang } from '../src/i18n';
import { showAppAlert } from '../src/AppDialog';

const AMBER = '#F59E0B';
const AMBER_DARK = '#D97706';
const MUTED = '#6b7280';

export default function LoginScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { t, toggle } = useLang();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<'id' | 'pw' | null>(null);

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      showAppAlert(t('login.notice'), t('login.enterBoth'));
      return;
    }
    try {
      setLoading(true);
      const res: any = await authApi.login({ identifier: identifier.trim(), password });
      // 监控（大屏）账号仅限网页端使用，App 不允许登录
      if (res.user?.role === 'monitor') {
        showAppAlert(t('login.loginFailed'), t('login.monitorOnly'));
        return;
      }
      await SecureStore.setItemAsync('token', res.access_token);
      await SecureStore.setItemAsync('user', JSON.stringify(res.user));
      dispatch(setCredentials({ token: res.access_token, user: res.user }));
      router.replace('/(tabs)/tasks');
    } catch (err: any) {
      if (__DEV__) console.error('Login Error:', err);
      // 后端会明确告诉是账号不存在、密码错误还是账户待审核，直接把这句话给司机看。
      // 只有压根没连上服务器时才显示技术细节（那时地址/网络才是真正要查的东西）。
      const serverMessage = err?.response?.data?.message ?? err?.data?.message;
      const noResponse = !err?.response && !err?.statusCode;
      if (serverMessage) {
        showAppAlert(t('login.loginFailed'), String(serverMessage));
      } else if (noResponse) {
        const currentUrl = await getBaseUrl();
        showAppAlert(
          t('login.loginFailed'),
          `${t('login.noServer')}\n\n${currentUrl}`,
        );
      } else {
        showAppAlert(t('login.loginFailed'), String(err?.message ?? t('login.tryAgain')));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header decoration */}
        <View style={styles.topDecoration}>
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />
        </View>

        {/* Logo area */}
        <View style={styles.logoBox}>
          <View style={styles.logoIconContainer}>
            <Image source={require('../assets/log.png')} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.logoTitle}>Excellent Construction</Text>
          <Text style={styles.logoSub}>{t('login.portal')}</Text>
        </View>

        {/* Login card */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('login.account')}</Text>
          <View style={[styles.inputContainer, focused === 'id' && styles.inputContainerFocused]}>
            <Ionicons name="person-outline" size={20} color={focused === 'id' ? AMBER : MUTED} />
            <TextInput
              style={styles.input}
              placeholder={t('login.accountPh')}
              value={identifier}
              onChangeText={setIdentifier}
              onFocus={() => setFocused('id')}
              onBlur={() => setFocused(null)}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
              placeholderTextColor={MUTED}
            />
          </View>

          <Text style={styles.label}>{t('login.password')}</Text>
          <View style={[styles.inputContainer, focused === 'pw' && styles.inputContainerFocused]}>
            <Ionicons name="lock-closed-outline" size={20} color={focused === 'pw' ? AMBER : MUTED} />
            <TextInput
              style={styles.input}
              placeholder={t('login.passwordPh')}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('pw')}
              onBlur={() => setFocused(null)}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              placeholderTextColor={MUTED}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(v => !v)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={MUTED} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, styles.loginBtn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.loginBtnText}>{t('login.login')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.registerRow}>
          <Text style={styles.tip}>{t('login.noAccount')}</Text>
          <TouchableOpacity onPress={() => router.push('/register')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.registerLink}>{t('login.register')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggle} style={styles.langBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.langBtnText}>{t('login.langToggle')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.version}>v1.0.0</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F1A',
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  topDecoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#fff',
    opacity: 0.08,
  },
  decorCircle2: {
    position: 'absolute',
    top: -50,
    left: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: AMBER_DARK,
    opacity: 0.05,
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: AMBER,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  logoImage: {
    width: 88,
    height: 88,
    borderRadius: 22,
  },
  logoTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  logoSub: {
    fontSize: 12,
    color: AMBER,
    letterSpacing: 3,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  label: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 18,
    paddingHorizontal: 14,
    gap: 10,
  },
  inputContainerFocused: {
    borderColor: AMBER,
    backgroundColor: '#0d1424',
  },
  input: {
    flex: 1,
    paddingVertical: 15,
    fontSize: 16,
    color: '#fff',
  },
  btn: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  loginBtn: {
    backgroundColor: AMBER,
    marginTop: 8,
    shadowColor: AMBER,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  loginBtnText: {
    color: '#1a1206',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  tip: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
  },
  registerLink: {
    color: AMBER,
    fontSize: 13,
    fontWeight: '700',
  },
  langBtn: {
    marginLeft: 12,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.5)',
  },
  langBtnText: {
    color: AMBER,
    fontSize: 12,
    fontWeight: '700',
  },
  version: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.15)',
    marginTop: 8,
    fontSize: 11,
  },
});
