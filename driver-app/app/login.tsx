import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch } from 'react-redux';
import * as SecureStore from 'expo-secure-store';
import { authApi, getBaseUrl } from '../src/api';
import { setCredentials } from '../src/store/authSlice';

export default function LoginScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverIp, setServerIp] = useState('192.168.1.108');
  const [showIpConfig, setShowIpConfig] = useState(false);

  useEffect(() => {
    // 初始化加载保存的 IP
    SecureStore.getItemAsync('server_ip').then(ip => {
      if (ip) setServerIp(ip);
    });
  }, []);

  const saveIp = async () => {
    await SecureStore.setItemAsync('server_ip', serverIp);
    Alert.alert('已保存', `服务器 IP 已更新为: ${serverIp}`);
    setShowIpConfig(false);
  };

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert('提示', '请填写账号和密码');
      return;
    }
    try {
      setLoading(true);
      const res: any = await authApi.login({ identifier: identifier.trim(), password });
      await SecureStore.setItemAsync('token', res.access_token);
      await SecureStore.setItemAsync('user', JSON.stringify(res.user));
      dispatch(setCredentials({ token: res.access_token, user: res.user }));
      router.replace('/(tabs)/tasks');
    } catch (err: any) {
      console.error('Login Error:', err);
      const currentUrl = await getBaseUrl();
      const detail = JSON.stringify(err, null, 2);
      const errorMsg = `无法连接到服务器: ${currentUrl}\n\n详情: ${err.message}\n\nJSON: ${detail.substring(0, 100)}`;
      Alert.alert('登录失败', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <TouchableOpacity 
          onLongPress={() => setShowIpConfig(true)}
          activeOpacity={1}
          style={styles.logoBox}
        >
          <Text style={styles.logoIcon}>🚛</Text>
          <Text style={styles.logoTitle}>货车司机</Text>
          <Text style={styles.logoSub}>Truck Driver App</Text>
        </TouchableOpacity>

        {showIpConfig && (
          <View style={[styles.card, { marginBottom: 20, borderColor: '#ff4d4f', borderWidth: 1 }]}>
            <Text style={[styles.label, { color: '#ff4d4f' }]}>高级设置：服务器 IP 地址</Text>
            <TextInput
              style={styles.input}
              placeholder="例如: 192.168.1.108"
              value={serverIp}
              onChangeText={setServerIp}
            />
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#ff4d4f' }]} onPress={saveIp}>
              <Text style={styles.btnText}>保存并应用 IP</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.card}>
          <Text style={{ fontSize: 12, color: '#999', marginBottom: 10, textAlign: 'center' }}>
            当前服务器: {serverIp}:3000
          </Text>
          <Text style={styles.label}>账号（邮箱或用户名）</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入账号"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
          />

          <Text style={styles.label}>密码</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入密码"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>登 录</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#52c41a', marginTop: 12 }]}
            onPress={async () => {
              try {
                const url = await getBaseUrl();
                const res = await fetch(`${url}/ping`);
                const data = await res.json();
                Alert.alert('连接成功', `服务器响应正常\n状态: ${data.status}\n地址: ${url}`);
              } catch (err: any) {
                const url = await getBaseUrl();
                Alert.alert('连接失败', `无法连接到: ${url}\n\n请长按上方图标修改 IP 或检查网络。\n\n错误: ${err.message}`);
              }
            }}
          >
            <Text style={styles.btnText}>检查服务器连接</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.tip}>如需注册账号，请联系管理员 (长按图标设置IP)</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1677ff' },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoBox: { alignItems: 'center', marginBottom: 36 },
  logoIcon: { fontSize: 64, marginBottom: 8 },
  logoTitle: { fontSize: 26, fontWeight: '700', color: '#fff' },
  logoSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  label: { fontSize: 14, color: '#666', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
  },
  btn: {
    backgroundColor: '#1677ff',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  tip: { textAlign: 'center', color: 'rgba(255,255,255,0.7)', marginTop: 24, fontSize: 13 },
});
