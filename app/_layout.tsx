import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../src/theme/colors';
import {
  initNotifications,
  startAppStateListener,
  ensurePermission,
} from '../src/services/notifications';
import { WebViewPanel } from '../src/components/WebViewPanel';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Sohne': require('../assets/Sohne-Buch.otf'),
    'Sohne-Bold': require('../assets/Sohne-Halbfett.otf'),
    'SohneMono': require('../assets/SohneMono-Buch.otf'),
    'TiemposText': require('../assets/TiemposText.otf'),
    'TiemposText-Bold': require('../assets/TiemposText-bold.otf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    // 设置通知 handler 和 Android 通知渠道
    initNotifications();
    // 开始追踪前后台状态
    const unsub = startAppStateListener();
    // 提前请求通知权限（Android 12 及以下自动授权，无对话框）
    ensurePermission();
    return unsub;
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="history"
          options={{ animation: 'slide_from_left', presentation: 'modal' }}
        />
        <Stack.Screen
          name="settings"
          options={{ animation: 'slide_from_right', presentation: 'modal' }}
        />
        <Stack.Screen
          name="chat/[id]"
          options={{ animation: 'slide_from_right' }}
        />
      </Stack>
      <WebViewPanel />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
