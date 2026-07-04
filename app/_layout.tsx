import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { lightColors, useThemeColors, type ThemeColors } from '../src/theme/colors';

import {
  initNotifications,
  startAppStateListener,
  ensurePermission,
} from '../src/services/notifications';
import { WebViewPanel } from '../src/components/WebViewPanel';
import { useSettingsStore } from '../src/stores/settings';
import { useLicenseStore } from '../src/stores/license';
import { InviteGate } from '../src/components/InviteGate';
import { IncomingShareHandler } from '../src/components/IncomingShareHandler';
import {
  addFloatingBallToolActionListener,
  hideFloatingBall,
  showFloatingBall,
} from '../src/services/floatingBall';
import { handleFloatingBallToolAction } from '../src/services/floatingToolActions';
import { startDesktopLyricSync, stopDesktopLyricSync } from '../src/services/desktopLyrics';
import { startFocusAppStateListener } from '../src/services/focusAppState';
import { startPromptCacheRemoteSnapshotFlushListener } from '../src/services/promptCacheKeepalive';
import { useChatStore } from '../src/stores/chat';


let colors = lightColors;
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  colors = useThemeColors();
  styles = useMemo(() => createStyles(colors), [colors]);
  const statusBarStyle = colors.background === '#12100D' ? 'light' : 'dark';

  const [fontsLoaded] = useFonts({
    'Sohne': require('../assets/Sohne-Buch.otf'),
    'Sohne-Bold': require('../assets/Sohne-Halbfett.otf'),
    'SohneMono': require('../assets/SohneMono-Buch.otf'),
    'TiemposText': require('../assets/TiemposText.otf'),
    'TiemposText-Bold': require('../assets/TiemposText-bold.otf'),
    'TiemposText-Strong': require('../assets/TiemposText-bold2.otf'),
  });
  const settingsHydrated = useSettingsStore((state) => state._hydrated);
  const licenseHydrated = useLicenseStore((state) => state._hydrated);
  const licenseGrant = useLicenseStore((state) => state.grant);
  const floatingBallEnabled = useSettingsStore((state) => state.floatingBallConfig.enabled);
  const floatingBallNormalImageUrisKey = useSettingsStore((state) =>
    (state.floatingBallConfig.normalImageUris || []).join('|') || state.floatingBallConfig.normalImageUri || ''
  );
  const floatingBallEdgeImageUrisKey = useSettingsStore((state) =>
    (state.floatingBallConfig.edgeImageUris || []).join('|') || state.floatingBallConfig.edgeImageUri || ''
  );
  const floatingBallAssetAutoSwitchEnabled = useSettingsStore((state) => !!state.floatingBallConfig.assetAutoSwitchEnabled);
  const floatingBallAssetAutoSwitchIntervalSeconds = useSettingsStore((state) => state.floatingBallConfig.assetAutoSwitchIntervalSeconds || 8);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (!settingsHydrated || !licenseHydrated) return;

    if (!licenseGrant) {
      hideFloatingBall().catch(() => undefined);
      return;
    }

    if (floatingBallEnabled) {
      showFloatingBall().catch(() => undefined);
    } else {
      hideFloatingBall().catch(() => undefined);
    }
  }, [
    settingsHydrated,
    licenseHydrated,
    licenseGrant,
    floatingBallEnabled,
    floatingBallNormalImageUrisKey,
    floatingBallEdgeImageUrisKey,
    floatingBallAssetAutoSwitchEnabled,
    floatingBallAssetAutoSwitchIntervalSeconds,
  ]);

  useEffect(() => {
    const sub = addFloatingBallToolActionListener((action) => {
      handleFloatingBallToolAction(action).catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    startDesktopLyricSync();
    return () => stopDesktopLyricSync();
  }, []);

  useEffect(() => {
    // 设置通知 handler 和 Android 通知渠道
    initNotifications();
    // 开始追踪前后台状态
    const unsub = startAppStateListener();
    // 提前请求通知权限（Android 12 及以下自动授权，无对话框）
    ensurePermission();
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = startFocusAppStateListener();
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = startPromptCacheRemoteSnapshotFlushListener();
    return unsub;
  }, []);

  useEffect(() => {
    // 必须等 settings 完成持久化恢复：否则 getRemoteConfig() 拿不到远程服务地址，
    // 首次同步会静默空跑，表现为"打开 App 后要刷新很多次才能看到 AI 主动消息"。
    if (!settingsHydrated) return;

    const syncRemoteInbox = () => {
      useChatStore.getState().syncPromptCacheRemoteInbox().catch(() => undefined);
    };
    syncRemoteInbox();
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncRemoteInbox();
      }
    });
    return () => sub.remove();
  }, [settingsHydrated]);

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={statusBarStyle} />
      <InviteGate>
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
            name="chat-diagnostics"
            options={{ animation: 'slide_from_right', presentation: 'modal' }}
          />
          <Stack.Screen
            name="api-usage"
            options={{ animation: 'slide_from_right', presentation: 'modal' }}
          />
          <Stack.Screen
            name="api-achievements"
            options={{ animation: 'slide_from_right', presentation: 'modal' }}
          />
          <Stack.Screen
            name="music"
            options={{ animation: 'slide_from_right', presentation: 'modal' }}
          />
          <Stack.Screen
            name="music-playlists"
            options={{ animation: 'slide_from_right', presentation: 'modal' }}
          />
          <Stack.Screen
            name="focus"
            options={{ animation: 'slide_from_right', presentation: 'modal' }}
          />
          <Stack.Screen
            name="daily-paper/[date]"
            options={{ animation: 'slide_from_right', presentation: 'modal' }}
          />
          <Stack.Screen
            name="reading/index"
            options={{ animation: 'slide_from_right', presentation: 'modal' }}
          />
          <Stack.Screen
            name="reading/[id]"
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="game/index"
            options={{ animation: 'slide_from_right', presentation: 'modal' }}
          />
          <Stack.Screen
            name="game/[id]"
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="m5stack"
            options={{ animation: 'slide_from_right', presentation: 'modal' }}
          />
          <Stack.Screen
            name="chat/[id]"
            options={{ animation: 'slide_from_right' }}
          />
        </Stack>
        <WebViewPanel />
        <IncomingShareHandler />
      </InviteGate>
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});

let styles = createStyles(colors);
