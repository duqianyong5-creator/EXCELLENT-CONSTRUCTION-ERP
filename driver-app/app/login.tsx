import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDispatch } from 'react-redux';
import * as SecureStore from 'expo-secure-store';
import { authApi, getBaseUrl } from '../src/api';
import { setCredentials } from '../src/store/authSlice';
import { useLang } from '../src/i18n';
import { showAppAlert } from '../src/AppDialog';
import { colors, space, font, weight, radius, hit, shadow } from '../src/theme';

/** How far the form card climbs over the hero's bottom edge */
const CARD_OVERLAP = space.huge;

export default function LoginScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { t, toggle } = useLang();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<'id' | 'pw' | null>(null);

  // The navy hero owns the top 40% of the screen; the form card overlaps its bottom edge
  const heroHeight = Math.round(windowHeight * 0.4);

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
    <View style={styles.container}>
      <StatusBar style="light" />
      {/* Navy behind the top of the scroll view, so an over-scroll at the top stays navy rather than grey */}
      <View style={[styles.heroBackdrop, { height: heroHeight }]} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero: logo tile, product name, one-line tagline */}
          <View style={[styles.hero, { minHeight: heroHeight, paddingTop: insets.top + space.xl }]}>
            <View style={styles.heroGlow} />
            <View style={styles.logoTile}>
              <Image source={require('../assets/log.png')} style={styles.logoImage} resizeMode="contain" />
            </View>
            <Text style={styles.brand}>Excellent Construction</Text>
            <Text style={styles.tagline}>{t('login.portal')}</Text>
          </View>

          {/* Form card, floating over the hero's bottom edge */}
          <View style={[styles.body, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.card}>
              <Text style={styles.label}>{t('login.account')}</Text>
              <View style={[styles.inputContainer, focused === 'id' && styles.inputContainerFocused]}>
                <Ionicons name="person-outline" size={20} color={focused === 'id' ? colors.accent : colors.textFaint} />
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
                  placeholderTextColor={colors.textFaint}
                />
              </View>

              <Text style={styles.label}>{t('login.password')}</Text>
              <View style={[styles.inputContainer, focused === 'pw' && styles.inputContainerFocused]}>
                <Ionicons name="lock-closed-outline" size={20} color={focused === 'pw' ? colors.accent : colors.textFaint} />
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
                  placeholderTextColor={colors.textFaint}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(v => !v)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textFaint} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('login.login')}</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.registerRow}>
              <Text style={styles.tip}>{t('login.noAccount')}</Text>
              <TouchableOpacity style={styles.registerBtn} onPress={() => router.push('/register')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.registerLink}>{t('login.register')}</Text>
              </TouchableOpacity>
            </View>

            {/* Pushes the version line to the bottom of the screen when the form is short */}
            <View style={styles.flex} />
            <Text style={styles.version}>v1.0.1</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Language switch: a global toggle, so it sits in the hero corner rather than beside "register" */}
      <TouchableOpacity
        onPress={toggle}
        style={[styles.langBtn, { top: insets.top + space.md }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.85}
      >
        <Ionicons name="globe-outline" size={16} color={colors.heroText} />
        <Text style={styles.langBtnText}>{t('login.langToggle')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  heroBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.hero,
  },
  hero: {
    backgroundColor: colors.hero,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    // Room for the card that climbs over the bottom edge
    paddingBottom: CARD_OVERLAP + space.xxl,
    overflow: 'hidden',
  },
  // A slightly lighter navy disc in the corner: depth without a second colour
  heroGlow: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: radius.pill,
    backgroundColor: colors.heroAlt,
  },
  logoTile: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
    ...shadow.raised,
  },
  logoImage: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
  },
  brand: {
    fontSize: font.xl,
    fontWeight: weight.heavy,
    color: colors.heroText,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: font.sm,
    color: colors.heroMuted,
    marginTop: space.xs,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    paddingHorizontal: space.lg,
    backgroundColor: colors.bg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    marginTop: -CARD_OVERLAP,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    ...shadow.raised,
  },
  label: {
    fontSize: font.sm,
    color: colors.textMuted,
    fontWeight: weight.semibold,
    marginBottom: space.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: hit.min,
    paddingHorizontal: space.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.lg,
  },
  inputContainerFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space.md,
    fontSize: font.base,
    color: colors.text,
  },
  eyeBtn: {
    width: hit.min,
    height: hit.min,
    alignItems: 'center',
    justifyContent: 'center',
    // A 48pt tap target that still sits flush with the right edge of the input
    marginRight: -space.md,
  },
  primaryBtn: {
    minHeight: hit.min,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  primaryBtnText: {
    color: colors.onAccent,
    fontSize: font.base,
    fontWeight: weight.bold,
    letterSpacing: 0.2,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.md,
  },
  tip: {
    color: colors.textMuted,
    fontSize: font.sm,
  },
  registerBtn: {
    minHeight: hit.min,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  registerLink: {
    color: colors.accentDark,
    fontSize: font.sm,
    fontWeight: weight.bold,
  },
  langBtn: {
    position: 'absolute',
    right: space.lg,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: hit.compact,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.heroBorder,
    borderWidth: 1,
    borderColor: colors.heroBorder,
  },
  langBtnText: {
    color: colors.heroText,
    fontSize: font.sm,
    fontWeight: weight.bold,
    letterSpacing: 0.5,
  },
  version: {
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: font.xs,
    marginTop: space.lg,
  },
});
