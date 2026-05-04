import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { usersApi } from '../../src/api';
import { logout, updateUser } from '../../src/store/authSlice';
import type { RootState } from '../../src/store';

export default function ProfileScreen() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { user } = useSelector((s: RootState) => s.auth);

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      await usersApi.updateProfile({ fullName, phone });
      dispatch(updateUser({ fullName, phone }));
      const stored = await SecureStore.getItemAsync('user');
      if (stored) {
        const u = JSON.parse(stored);
        await SecureStore.setItemAsync('user', JSON.stringify({ ...u, fullName, phone }));
      }
      Alert.alert('✅ 保存成功');
    } catch (err: any) {
      Alert.alert('失败', err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) {
      Alert.alert('提示', '请填写原密码和新密码');
      return;
    }
    if (newPwd.length < 6) {
      Alert.alert('提示', '新密码至少6位');
      return;
    }
    try {
      setChangingPwd(true);
      await usersApi.changePassword({ oldPassword: oldPwd, newPassword: newPwd });
      setOldPwd('');
      setNewPwd('');
      Alert.alert('✅ 密码已修改', '请重新登录');
      handleLogout();
    } catch (err: any) {
      Alert.alert('失败', err.message || '修改密码失败');
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
    Alert.alert('退出登录', '确认退出？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: handleLogout },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      {/* 头部 */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.fullName || user?.username || '?')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.fullName || user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>司机</Text>
        </View>
      </View>

      {/* 基本信息 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>基本信息</Text>
        <Text style={styles.label}>姓名</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="请输入姓名"
        />
        <Text style={styles.label}>手机号</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="请输入手机号"
          keyboardType="phone-pad"
        />
        <TouchableOpacity
          style={[styles.btn, styles.primaryBtn, saving && styles.btnDisabled]}
          onPress={handleSaveProfile}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>保存信息</Text>
          }
        </TouchableOpacity>
      </View>

      {/* 修改密码 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>修改密码</Text>
        <Text style={styles.label}>原密码</Text>
        <TextInput
          style={styles.input}
          value={oldPwd}
          onChangeText={setOldPwd}
          secureTextEntry
          placeholder="请输入原密码"
        />
        <Text style={styles.label}>新密码</Text>
        <TextInput
          style={styles.input}
          value={newPwd}
          onChangeText={setNewPwd}
          secureTextEntry
          placeholder="至少6位"
        />
        <TouchableOpacity
          style={[styles.btn, styles.primaryBtn, changingPwd && styles.btnDisabled]}
          onPress={handleChangePassword}
          disabled={changingPwd}
        >
          {changingPwd
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>修改密码</Text>
          }
        </TouchableOpacity>
      </View>

      {/* 退出 */}
      <TouchableOpacity style={[styles.btn, styles.logoutBtn]} onPress={confirmLogout}>
        <Text style={[styles.btnText, { color: '#ff4d4f' }]}>退出登录</Text>
      </TouchableOpacity>

      <Text style={styles.version}>货车司机 v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#1677ff',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 30,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 28, color: '#fff', fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '700', color: '#fff' },
  email: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 20, marginTop: 8,
  },
  roleText: { color: '#fff', fontSize: 12 },
  section: {
    backgroundColor: '#fff',
    margin: 16, marginBottom: 0,
    borderRadius: 14, padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  label: { fontSize: 13, color: '#888', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 10, padding: 12, fontSize: 15,
    backgroundColor: '#fafafa', color: '#1a1a1a',
  },
  btn: {
    borderRadius: 10, padding: 15,
    alignItems: 'center', marginTop: 14,
  },
  primaryBtn: { backgroundColor: '#1677ff' },
  logoutBtn: {
    backgroundColor: '#fff', margin: 16, marginTop: 20,
    borderWidth: 1, borderColor: '#ff4d4f',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  version: { textAlign: 'center', color: '#bbb', fontSize: 12, marginVertical: 24 },
});
