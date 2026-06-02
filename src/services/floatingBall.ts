import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { useSettingsStore } from '../stores/settings';
import { playTTS, stopTTS } from './tts';

interface FloatingBallModule {
  canDrawOverlays: () => Promise<boolean>;
  openOverlaySettings: () => Promise<boolean>;
  show: () => Promise<boolean>;
  hide: () => Promise<boolean>;
  isShowing: () => Promise<boolean>;
  showMessage: (text: string) => Promise<boolean>;
  hideMessage: () => Promise<boolean>;
  openApp: () => Promise<boolean>;
  captureScreen: () => Promise<string | null>;
}

interface FloatingBallMessageOptions {
  speak?: boolean;
}

export type FloatingBallToolAction =
  | 'screen_share'
  | 'get_reply'
  | 'open_app'
  | { action: 'text_input'; text?: string };

const nativeModule = NativeModules.FloatingBall as FloatingBallModule | undefined;

function ensureFloatingBall(): FloatingBallModule {
  if (Platform.OS !== 'android') {
    throw new Error('悬浮球仅支持 Android');
  }
  if (!nativeModule) {
    throw new Error('悬浮球原生模块未加载，请重新运行 npx expo run:android 安装新包');
  }
  return nativeModule;
}

export async function canDrawFloatingBall(): Promise<boolean> {
  return ensureFloatingBall().canDrawOverlays();
}

export async function openFloatingBallPermissionSettings(): Promise<void> {
  await ensureFloatingBall().openOverlaySettings();
}

export async function showFloatingBall(): Promise<void> {
  await ensureFloatingBall().show();
}

export async function hideFloatingBall(): Promise<void> {
  await ensureFloatingBall().hide();
  stopTTS().catch(() => {});
}

export async function isFloatingBallShowing(): Promise<boolean> {
  return ensureFloatingBall().isShowing();
}

export async function showFloatingBallMessage(
  text: string,
  options: FloatingBallMessageOptions = {}
): Promise<void> {
  await ensureFloatingBall().showMessage(text);
  if (options.speak !== false) {
    playFloatingBallTTS(text);
  }
}

export async function hideFloatingBallMessage(): Promise<void> {
  await ensureFloatingBall().hideMessage();
  stopTTS().catch(() => {});
}

export async function openYSClaudeFromFloatingBall(): Promise<void> {
  await ensureFloatingBall().openApp();
}

export async function captureFloatingBallScreen(): Promise<string | null> {
  return ensureFloatingBall().captureScreen();
}

export function addFloatingBallToolActionListener(
  listener: (action: FloatingBallToolAction) => void
): { remove: () => void } {
  return DeviceEventEmitter.addListener('FloatingBallToolAction', listener);
}

function playFloatingBallTTS(text: string): void {
  const speakableText = sanitizeFloatingBallTTS(text);
  if (!speakableText) return;

  const { floatingBallConfig, ttsConfig } = useSettingsStore.getState();
  if (!floatingBallConfig.ttsEnabled) return;

  playTTS(speakableText, ttsConfig).catch(() => {});
}

function sanitizeFloatingBallTTS(text: string): string {
  let next = text;
  const bracketedContentPattern =
    /\[[^\[\]]*\]|\([^()]*\)|\{[^{}]*\}|\u3010[^\u3010\u3011]*\u3011|\uFF08[^\uFF08\uFF09]*\uFF09|\uFF5B[^\uFF5B\uFF5D]*\uFF5D/g;

  while (bracketedContentPattern.test(next)) {
    next = next.replace(bracketedContentPattern, ' ');
    bracketedContentPattern.lastIndex = 0;
  }

  return next.replace(/\s+/g, ' ').trim();
}
