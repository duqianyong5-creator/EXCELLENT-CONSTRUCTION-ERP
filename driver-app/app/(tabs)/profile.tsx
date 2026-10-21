import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useDispatch, useSelector } from 'react-redux';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { usersApi } from '../../src/api';
import { logout, updateUser } from '../../src/store/authSlice';
import type { RootState } from '../../src/store';
import { useLang } from '../../src/i18n';
import { showAppAlert } from '../../src/AppDialog';
import { colors, space, font, weight, radius, hit, shadow } from '../../src/theme';

/** How far the first card climbs over the hero's bottom edge */
const CARD_OVERLAP = space.xl;

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/** Card title row: a 36px amber icon chip beside the title */
function SectionHeader({ icon, title }: { icon: IoniconName; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconChip}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { user } = useSelector((s: RootState) => s.auth);
  const { t, toggle } = useLang();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  // The hero sits under the status bar, so the status icons go light while this tab is on screen.
  // The <StatusBar> is mounted only while focused, so it hands the style back when the tab blurs.
  const [isFocused, setIsFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setIsFocused(true);
    return () => setIsFocused(false);
  }, []));

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      await usersApi.updateProfile({ fullName, phone, email });
      dispatch(updateUser({ fullName, phone, email }));
      const stored = await SecureStore.getItemAsync('user');
      if (stored) {
        const u = JSON.parse(stored);
        await SecureStore.setItemAsync('user', JSON.stringify({ ...u, fullName, phone, email }));
      }
      showAppAlert(t('profile.saved'));
    } catch (err: any) {
      showAppAlert(t('common.fail'), err.message || t('profile.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) {
      showAppAlert(t('common.notice'), t('profile.pwBothRequired'));
      return;
    }
    if (newPwd.length < 6) {
      showAppAlert(t('common.notice'), t('profile.pwMin6'));
      return;
    }
    try {
      setChangingPwd(true);
      await usersApi.changePassword({ oldPassword: oldPwd, newPassword: newPwd });
      setOldPwd('');
      setNewPwd('');
      showAppAlert(t('profile.pwChanged'), t('profile.reLogin'));
      handleLogout();
    } catch (err: any) {
      showAppAlert(t('common.fail'), err.message || t('profile.pwChangeFailed'));
    } finally {
      setChangingPwd(false);
    }
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('user');
    dispatch(logout());
    router.replace('/login');
  };

  const confirmLogout = () => {
    showAppAlert(t('profile.logout'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.exit'), style: 'destructive', onPress: handleLogout },
    ]);
  };

  return (
    <View style={styles.container}>
      {isFocused && <StatusBar style="light" />}
      {/* Navy behind the top of the scroll view, so an over-scroll at the top stays navy rather than grey */}
      <View style={styles.heroBackdrop} />

      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero: avatar tile, name, e-mail, role pill */}
        <View style={[styles.hero, { paddingTop: insets.top + space.xl }]}>
          <View style={styles.heroGlow} />
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {String(user?.fullName || user?.username || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>{user?.fullName || user?.username}</Text>
          <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
          <View style={styles.rolePill}>
            <Ionicons name="id-card-outline" size={14} color={colors.heroMuted} />
            <Text style={styles.roleText}>{t('role.' + (user?.role || 'driver'))}</Text>
          </View>
        </View>

        <View style={styles.body}>
          {/* Basic info */}
          <View style={[styles.card, styles.firstCard]}>
            <SectionHeader icon="person-outline" title={t('profile.basicInfo')} />

            <Text style={styles.label}>{t('profile.name')}</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder={t('profile.namePh')}
                placeholderTextColor={colors.textFaint}
              />
            </View>

            <Text style={styles.label}>{t('profile.phone')}</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder={t('profile.phonePh')}
                keyboardType="phone-pad"
                placeholderTextColor={colors.textFaint}
              />
            </View>

            <Text style={styles.label}>{t('profile.email')}</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder={t('profile.emailPh')}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={colors.textFaint}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, saving && styles.btnDisabled]}
              onPress={handleSaveProfile}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryBtnText}>{t('profile.save')}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Change password */}
          <View style={styles.card}>
            <SectionHeader icon="lock-closed-outline" title={t('profile.changePw')} />

            <Text style={styles.label}>{t('profile.oldPw')}</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={oldPwd}
                onChangeText={setOldPwd}
                secureTextEntry
                placeholder={t('profile.oldPwPh')}
                placeholderTextColor={colors.textFaint}
              />
            </View>

            <Text style={styles.label}>{t('profile.newPw')}</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={newPwd}
                onChangeText={setNewPwd}
                secureTextEntry
                placeholder={t('profile.min6')}
                placeholderTextColor={colors.textFaint}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, changingPwd && styles.btnDisabled]}
              onPress={handleChangePassword}
              disabled={changingPwd}
              activeOpacity={0.85}
            >
              {changingPwd ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryBtnText}>{t('profile.changePw')}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Settings: the language switch lives here so it stays reachable after login */}
          <View style={styles.card}>
            <SectionHeader icon="settings-outline" title={t('profile.settings')} />
            <TouchableOpacity style={styles.settingRow} onPress={toggle} activeOpacity={0.7}>
              <Ionicons name="language-outline" size={20} color={colors.textMuted} />
              <Text style={styles.settingLabel}>{t('profile.language')}</Text>
              <Text style={styles.settingValue}>{t('profile.languageValue')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </TouchableOpacity>
          </View>

          {/* Sign out: outlined danger, never a filled red block */}
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={confirmLogout}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={styles.logoutText}>{t('profile.logout')}</Text>
          </TouchableOpacity>

          <Text style={styles.version}>{t('profile.version')}</Text>
        </View>
      </ScrollView>
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
    paddingBottom: space.lg,
  },
  heroBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '35%',
    backgroundColor: colors.hero,
  },
  hero: {
    backgroundColor: colors.hero,
    alignItems: 'center',
    paddingHorizontal: space.lg,
    // Room for the first card that climbs over the bottom edge
    paddingBottom: CARD_OVERLAP + space.xxl,
    overflow: 'hidden',
  },
  // A slightly lighter navy disc in the corner: depth without a second colour
  heroGlow: {
    position: 'absolute',
    top: -140,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: radius.pill,
    backgroundColor: colors.heroAlt,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
    ...shadow.raised,
  },
  avatarText: {
    fontSize: font.xxl,
    fontWeight: weight.heavy,
    color: colors.hero,
  },
  name: {
    fontSize: font.xl,
    fontWeight: weight.heavy,
    color: colors.heroText,
    textAlign: 'center',
  },
  email: {
    fontSize: font.sm,
    color: colors.heroMuted,
    marginTop: space.xs,
    textAlign: 'center',
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.heroBorder,
    backgroundColor: colors.heroBorder,
  },
  roleText: {
    color: colors.heroText,
    fontSize: font.sm,
    fontWeight: weight.semibold,
  },
  body: {
    flex: 1,
    paddingHorizontal: space.lg,
    backgroundColor: colors.bg,
    gap: space.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    ...shadow.card,
  },
  firstCard: {
    marginTop: -CARD_OVERLAP,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.lg,
  },
  sectionIconChip: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: font.base,
    fontWeight: weight.heavy,
    color: colors.text,
  },
  label: {
    fontSize: font.sm,
    color: colors.textMuted,
    fontWeight: weight.semibold,
    marginBottom: space.sm,
  },
  inputContainer: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.lg,
  },
  input: {
    minHeight: hit.min,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    fontSize: font.base,
    color: colors.text,
  },
  primaryBtn: {
    minHeight: hit.min,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
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
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: hit.min,
  },
  settingLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: font.base,
    fontWeight: weight.semibold,
  },
  settingValue: {
    color: colors.textMuted,
    fontSize: font.sm,
    fontWeight: weight.medium,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: hit.min,
    marginTop: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  logoutText: {
    color: colors.danger,
    fontSize: font.base,
    fontWeight: weight.bold,
  },
  version: {
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: font.xs,
    marginTop: space.xs,
  },
});
