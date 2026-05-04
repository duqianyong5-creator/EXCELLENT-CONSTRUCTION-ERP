import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { Provider } from 'react-redux';
import { store } from '../src/store';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useSegments } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { setCredentials } from '../src/store/authSlice';
import type { RootState } from '../src/store';
import { View, ActivityIndicator } from 'react-native';

function AuthGuard() {
  const router = useRouter();
  const segments = useSegments();
  const dispatch = useDispatch();
  const { isAuthenticated } = useSelector((s: RootState) => s.auth);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const restore = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        const userStr = await SecureStore.getItemAsync('user');
        if (token && userStr) {
          dispatch(setCredentials({ token, user: JSON.parse(userStr) }));
        }
      } catch { /* ignore */ }
      setChecking(false);
    };
    restore();
  }, []);

  useEffect(() => {
    if (checking) return;
    const inAuth = segments[0] === 'login';
    if (!isAuthenticated && !inAuth) {
      router.replace('/login');
    } else if (isAuthenticated && inAuth) {
      router.replace('/(tabs)/tasks');
    }
  }, [isAuthenticated, checking, segments]);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1677ff" />
      </View>
    );
  }
  return null;
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="task/[id]" />
      </Stack>
    </Provider>
  );
}
