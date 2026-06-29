import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { usersApi } from '../../src/api';
import { logout, updateUser } from '../../src/store/authSlice';
import type { RootState } from '../../src/store';
import { useLang } from '../../src/i18n';
import { showAppAlert } from '../../src/AppDialog';

const AMBER = '#F59E0B';
const AMBER_DARK = '#D97706';

export default function ProfileScreen() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { user } = useSelector((s: RootState) => s.auth);
  const { t } = useLang();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

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
      showAppAlert('✅ ' + t('profile.saved'));
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
      showAppAlert('✅ ' + t('profile.pwChanged'), t('profile.reLogin'));
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
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* 头部 */}
      <View style={styles.header}>
        <View style={styles.headerBg}>
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />
        </View>
        <Text style={styles.name}>{user?.fullName || user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleIcon}>🚛</Text>
          <Text style={styles.roleText}>{t('role.' + (user?.role || 'driver'))}</Text>
        </View>
      </View>

      {/* 基本信息 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionIcon}>👤</Text>
          <Text style={styles.sectionTitle}>{t('profile.basicInfo')}</Text>
        </View>

        <Text style={styles.label}>{t('profile.name')}</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder={t('profile.namePh')}
            placeholderTextColor="#6b7280"
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
            placeholderTextColor="#6b7280"
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
            placeholderTextColor="#6b7280"
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.primaryBtn, saving && styles.btnDisabled]}
          onPress={handleSaveProfile}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.btnText}>{t('profile.save')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* 修改密码 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionIcon}>🔐</Text>
          <Text style={styles.sectionTitle}>{t('profile.changePw')}</Text>
        </View>

        <Text style={styles.label}>{t('profile.oldPw')}</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={oldPwd}
            onChangeText={setOldPwd}
            secureTextEntry
            placeholder={t('profile.oldPwPh')}
            placeholderTextColor="#6b7280"
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
            placeholderTextColor="#6b7280"
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.primaryBtn, changingPwd && styles.btnDisabled]}
          onPress={handleChangePassword}
          disabled={changingPwd}
          activeOpacity={0.8}
        >
          {changingPwd ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.btnText}>{t('profile.changePw')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* 退出登录 */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={confirmLogout}
        activeOpacity={0.8}
      >
        <Text style={styles.logoutText}>{t('profile.logout')}</Text>
      </TouchableOpacity>

      <Text style={styles.version}>{t('profile.version')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F1A',
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 30,
    position: 'relative',
    overflow: 'hidden',
  },
  headerBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: '#111827',
  },
  decorCircle1: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: AMBER,
    opacity: 0.08,
  },
  decorCircle2: {
    position: 'absolute',
    top: -30,
    left: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: AMBER_DARK,
    opacity: 0.05,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: AMBER,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AMBER,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  avatarText: {
    fontSize: 36,
    color: '#000',
    fontWeight: '800',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    borderWidth: 3,
    borderColor: '#0B0F1A',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${AMBER}20`,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${AMBER}30`,
  },
  roleIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  roleText: {
    color: AMBER,
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    margin: 16,
    marginBottom: 0,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  label: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
    fontWeight: '500',
  },
  inputContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 14,
  },
  input: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#fff',
  },
  btn: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtn: {
    backgroundColor: AMBER,
    shadowColor: AMBER,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  logoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    margin: 16,
    marginTop: 20,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  version: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.2)',
    fontSize: 12,
    marginVertical: 20,
  },
});
