import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { sqliteStorage } from '../db/kv-storage';
import { APIConfig } from '../types';
import { DEFAULT_HOTBOARD_PLATFORM_TYPES } from '../utils/hotboardPlatforms';
import type { TopBarIconKey } from '../utils/topBarIconTypes';

export type ChatInputIconKey =
  | 'options'
  | 'sticker'
  | 'sendIdle'
  | 'sendFocused'
  | 'stop';

export type ChatInputAppearanceStyle = 'default' | 'glass';

export interface AppearanceThemeSnapshot {
  topBarIconUris: Partial<Record<TopBarIconKey, string>>;
  topBarIconsHidden?: boolean;
  topBarFadeHidden?: boolean;
  chatBackgroundImageUri?: string;
  userBubbleColor?: string;
  userBubbleTransparent?: boolean;
  userBubbleRadius?: number;
  userBubbleBlurIntensity?: number;
  messageAvatarsVisible?: boolean;
  messageMetaVisible?: boolean;
  userAvatarImageUri?: string;
  assistantAvatarImageUri?: string;
  messageAvatarRadius?: number;
  userDisplayName?: string;
  assistantDisplayName?: string;
  assistantFooterHidden?: boolean;
  assistantFooterColor?: string;
  userTextColor?: string;
  assistantTextColor?: string;
  assistantTextStrokeColor?: string;
  assistantTextStrokeWidth?: number;
  userFontSize?: number;
  assistantFontSize?: number;
  inputBackgroundImageUri?: string;
  inputBackgroundTransparent?: boolean;
  inputStyle?: ChatInputAppearanceStyle;
  inputBlurIntensity?: number;
  inputIconUris?: Partial<Record<ChatInputIconKey, string>>;
}

export interface AppearanceTheme {
  id: string;
  name: string;
  updatedAt: number;
  config: AppearanceThemeSnapshot;
}

export interface NamedAPIConfig extends APIConfig {
  name: string;
}

// HiddenRange 已迁移到 src/types，这里 re-export 保持旧的 import 路径兼容。
export type { HiddenRange } from '../types';

export interface TTSConfig {
  groupId: string;
  apiKey: string;
  model: string;
  voiceId: string;
  speed: number;
  vol: number;
  pitch: number;
}

export interface MemoryVaultConfig {
  enabled: boolean;
  baseUrl: string;
  adminToken: string;
  topK: number;
  tokenBudget: number;
  maxToolCalls: number;
}

export interface WebSearchConfig {
  enabled: boolean;
  tavilyApiKey: string;
  maxResults: number;
}

export interface WebPageReaderConfig {
  enabled: boolean;
  renderServiceUrl: string;
}

export interface WebInteractionConfig {
  enabled: boolean;
  maxToolCalls: number;
}

export interface HotboardConfig {
  enabled: boolean;
  apiKey: string;
  platforms: string;
}

export interface NativeToolConfig {
  deviceInfoEnabled: boolean;
  batteryStatusEnabled: boolean;
  appUsageStatsEnabled: boolean;
  calendarEnabled: boolean;
}

export interface ShizukuFileRoot {
  id: string;
  name: string;
  path: string;
  addedAt: number;
}

export interface ShizukuFileConfig {
  enabled: boolean;
  roots: ShizukuFileRoot[];
  maxToolCalls: number;
}

export interface ReadingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  summarySystemPrompt: string;
  sourceCharLimit: number;
  conversationMessageLimit: number;
}

export interface FloatingBallConfig {
  enabled: boolean;
  ttsEnabled: boolean;
}

export interface PeriodConfig {
  sendToAI: boolean;
}

export interface PromptCacheConfig {
  enabled: boolean;
}

export interface AppearanceConfig extends AppearanceThemeSnapshot {
  appearanceThemes?: AppearanceTheme[];
  activeAppearanceThemeId?: string;
}

const DEFAULT_APPEARANCE_CONFIG: AppearanceConfig = {
  topBarIconUris: {},
  topBarIconsHidden: false,
  messageAvatarsVisible: false,
  messageMetaVisible: true,
  messageAvatarRadius: 18,
  userDisplayName: 'You',
  assistantDisplayName: 'Claude',
  inputIconUris: {},
  inputStyle: 'default',
  inputBlurIntensity: 72,
  appearanceThemes: [],
};

function createDefaultAppearanceConfig(): AppearanceConfig {
  return {
    ...DEFAULT_APPEARANCE_CONFIG,
    topBarIconUris: {},
    inputIconUris: {},
    appearanceThemes: [],
    activeAppearanceThemeId: undefined,
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function snapshotAppearanceConfig(config?: AppearanceConfig): AppearanceThemeSnapshot {
  const source = config || DEFAULT_APPEARANCE_CONFIG;
  return {
    topBarIconUris: { ...(source.topBarIconUris || {}) },
    topBarIconsHidden: source.topBarIconsHidden,
    topBarFadeHidden: source.topBarFadeHidden,
    chatBackgroundImageUri: source.chatBackgroundImageUri,
    userBubbleColor: source.userBubbleColor,
    userBubbleTransparent: source.userBubbleTransparent,
    userBubbleRadius: source.userBubbleRadius,
    userBubbleBlurIntensity: source.userBubbleBlurIntensity,
    messageAvatarsVisible: source.messageAvatarsVisible,
    messageMetaVisible: source.messageMetaVisible,
    userAvatarImageUri: source.userAvatarImageUri,
    assistantAvatarImageUri: source.assistantAvatarImageUri,
    messageAvatarRadius: source.messageAvatarRadius,
    userDisplayName: source.userDisplayName,
    assistantDisplayName: source.assistantDisplayName,
    assistantFooterHidden: source.assistantFooterHidden,
    assistantFooterColor: source.assistantFooterColor,
    userTextColor: source.userTextColor,
    assistantTextColor: source.assistantTextColor,
    assistantTextStrokeColor: source.assistantTextStrokeColor,
    assistantTextStrokeWidth: source.assistantTextStrokeWidth,
    userFontSize: source.userFontSize,
    assistantFontSize: source.assistantFontSize,
    inputBackgroundImageUri: source.inputBackgroundImageUri,
    inputBackgroundTransparent: source.inputBackgroundTransparent,
    inputStyle: source.inputStyle,
    inputBlurIntensity: source.inputBlurIntensity,
    inputIconUris: { ...(source.inputIconUris || {}) },
  };
}

interface SettingsState {
  _hydrated: boolean;
  apiConfigs: NamedAPIConfig[];
  activeConfigIndex: number;
  systemPrompt: string;
  systemPrompts: { name: string; content: string }[];
  maxOutputTokens: number | null;
  stripThinking: boolean;
  ttsConfig: TTSConfig;
  memoryVaultConfig: MemoryVaultConfig;
  webSearchConfig: WebSearchConfig;
  webPageReaderConfig: WebPageReaderConfig;
  webInteractionConfig: WebInteractionConfig;
  hotboardConfig: HotboardConfig;
  nativeToolConfig: NativeToolConfig;
  shizukuFileConfig: ShizukuFileConfig;
  readingConfig: ReadingConfig;
  floatingBallConfig: FloatingBallConfig;
  periodConfig: PeriodConfig;
  promptCacheConfig: PromptCacheConfig;
  appearanceConfig: AppearanceConfig;

  setActiveConfig: (index: number) => void;
  saveAPIConfig: (config: NamedAPIConfig) => void;
  removeAPIConfig: (index: number) => void;
  setSystemPrompt: (prompt: string) => void;
  setSystemPrompts: (prompts: { name: string; content: string }[]) => void;
  setMaxOutputTokens: (tokens: number | null) => void;
  setStripThinking: (value: boolean) => void;
  setTTSConfig: (config: Partial<TTSConfig>) => void;
  setMemoryVaultConfig: (config: Partial<MemoryVaultConfig>) => void;
  setWebSearchConfig: (config: Partial<WebSearchConfig>) => void;
  setWebPageReaderConfig: (config: Partial<WebPageReaderConfig>) => void;
  setWebInteractionConfig: (config: Partial<WebInteractionConfig>) => void;
  setHotboardConfig: (config: Partial<HotboardConfig>) => void;
  setNativeToolConfig: (config: Partial<NativeToolConfig>) => void;
  setShizukuFileConfig: (config: Partial<ShizukuFileConfig>) => void;
  setReadingConfig: (config: Partial<ReadingConfig>) => void;
  setFloatingBallConfig: (config: Partial<FloatingBallConfig>) => void;
  setPeriodConfig: (config: Partial<PeriodConfig>) => void;
  setPromptCacheConfig: (config: Partial<PromptCacheConfig>) => void;
  setAppearanceConfig: (config: Partial<AppearanceConfig>) => void;
  setTopBarIconUri: (key: TopBarIconKey, uri: string) => void;
  clearTopBarIconUri: (key: TopBarIconKey) => void;
  resetTopBarIcons: () => void;
  setChatInputIconUri: (key: ChatInputIconKey, uri: string) => void;
  clearChatInputIconUri: (key: ChatInputIconKey) => void;
  resetChatInputIcons: () => void;
  saveAppearanceTheme: (name: string) => string;
  updateAppearanceTheme: (id: string) => void;
  applyAppearanceTheme: (id: string) => void;
  removeAppearanceTheme: (id: string) => void;
  resetAppearanceConfig: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      _hydrated: false,
      apiConfigs: [],
      activeConfigIndex: 0,
      systemPrompt: 'You are a helpful assistant.',
      systemPrompts: [
        { name: '默认', content: 'You are a helpful assistant.' },
      ],
      maxOutputTokens: null,
      stripThinking: false,
      ttsConfig: {
        groupId: '',
        apiKey: '',
        model: 'speech-02-hd',
        voiceId: '',
        speed: 1,
        vol: 1,
        pitch: 0,
      },
      memoryVaultConfig: {
        enabled: false,
        baseUrl: '',
        adminToken: '',
        topK: 5,
        tokenBudget: 2000,
        maxToolCalls: 3,
      },
      webSearchConfig: {
        enabled: false,
        tavilyApiKey: '',
        maxResults: 5,
      },
      webPageReaderConfig: {
        enabled: false,
        renderServiceUrl: '',
      },
      webInteractionConfig: {
        enabled: false,
        maxToolCalls: 8,
      },
      hotboardConfig: {
        enabled: false,
        apiKey: '',
        platforms: DEFAULT_HOTBOARD_PLATFORM_TYPES.join(','),
      },
      nativeToolConfig: {
        deviceInfoEnabled: false,
        batteryStatusEnabled: false,
        appUsageStatsEnabled: false,
        calendarEnabled: false,
      },
      shizukuFileConfig: {
        enabled: false,
        roots: [],
        maxToolCalls: 6,
      },
      readingConfig: {
        baseUrl: '',
        apiKey: '',
        model: '',
        systemPrompt:
          '你是一个温柔、细致的 AI 共读伙伴。围绕用户正在阅读的原文回答，帮助解释、联想、提问和梳理，但不要剧透当前原文之后的内容。',
        summarySystemPrompt:
          '你是一个细致的 AI 共读记录整理者。只根据用户提供的聊天记录做总结，不补充书籍原文、阅读位置或外部信息。',
        sourceCharLimit: 4000,
        conversationMessageLimit: 8,
      },
      floatingBallConfig: {
        enabled: false,
        ttsEnabled: false,
      },
      periodConfig: {
        sendToAI: false,
      },
      promptCacheConfig: {
        enabled: false,
      },
      appearanceConfig: DEFAULT_APPEARANCE_CONFIG,

      setActiveConfig: (index) => set({ activeConfigIndex: index }),

      saveAPIConfig: (config) =>
        set((state) => {
          const existingIndex = state.apiConfigs.findIndex((c) => c.name === config.name);
          if (existingIndex >= 0) {
            const configs = [...state.apiConfigs];
            configs[existingIndex] = config;
            return { apiConfigs: configs };
          }
          return { apiConfigs: [...state.apiConfigs, config] };
        }),

      removeAPIConfig: (index) =>
        set((state) => ({
          apiConfigs: state.apiConfigs.filter((_, i) => i !== index),
          activeConfigIndex:
            state.activeConfigIndex >= state.apiConfigs.length - 1
              ? Math.max(0, state.apiConfigs.length - 2)
              : state.activeConfigIndex,
        })),

      setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
      setSystemPrompts: (prompts) => set({ systemPrompts: prompts }),

      setMaxOutputTokens: (tokens) => set({ maxOutputTokens: tokens }),
      setStripThinking: (value) => set({ stripThinking: value }),
      setTTSConfig: (config) =>
        set((state) => ({ ttsConfig: { ...state.ttsConfig, ...config } })),
      setMemoryVaultConfig: (config) =>
        set((state) => ({ memoryVaultConfig: { ...state.memoryVaultConfig, ...config } })),
      setWebSearchConfig: (config) =>
        set((state) => ({ webSearchConfig: { ...state.webSearchConfig, ...config } })),
      setWebPageReaderConfig: (config) =>
        set((state) => ({ webPageReaderConfig: { ...state.webPageReaderConfig, ...config } })),
      setWebInteractionConfig: (config) =>
        set((state) => ({ webInteractionConfig: { ...state.webInteractionConfig, ...config } })),
      setHotboardConfig: (config) =>
        set((state) => ({ hotboardConfig: { ...state.hotboardConfig, ...config } })),
      setNativeToolConfig: (config) =>
        set((state) => ({ nativeToolConfig: { ...state.nativeToolConfig, ...config } })),
      setShizukuFileConfig: (config) =>
        set((state) => ({
          shizukuFileConfig: {
            ...(state.shizukuFileConfig || { enabled: false, roots: [], maxToolCalls: 6 }),
            ...config,
          },
        })),
      setReadingConfig: (config) =>
        set((state) => ({ readingConfig: { ...state.readingConfig, ...config } })),
      setFloatingBallConfig: (config) =>
        set((state) => ({ floatingBallConfig: { ...state.floatingBallConfig, ...config } })),
      setPeriodConfig: (config) =>
        set((state) => ({ periodConfig: { ...state.periodConfig, ...config } })),
      setPromptCacheConfig: (config) =>
        set((state) => ({ promptCacheConfig: { ...(state.promptCacheConfig || { enabled: false }), ...config } })),
      setAppearanceConfig: (config) =>
        set((state) => ({
          appearanceConfig: {
            ...(state.appearanceConfig || { topBarIconUris: {}, inputIconUris: {}, inputStyle: 'default' }),
            ...config,
            topBarIconUris: {
              ...(state.appearanceConfig?.topBarIconUris || {}),
              ...(config.topBarIconUris || {}),
            },
            inputIconUris: {
              ...(state.appearanceConfig?.inputIconUris || {}),
              ...(config.inputIconUris || {}),
            },
          },
        })),
      setTopBarIconUri: (key, uri) =>
        set((state) => ({
          appearanceConfig: {
            ...(state.appearanceConfig || { topBarIconUris: {}, inputIconUris: {}, inputStyle: 'default' }),
            topBarIconUris: {
              ...(state.appearanceConfig?.topBarIconUris || {}),
              [key]: uri,
            },
          },
        })),
      clearTopBarIconUri: (key) =>
        set((state) => {
          const nextUris = { ...(state.appearanceConfig?.topBarIconUris || {}) };
          delete nextUris[key];
          return {
            appearanceConfig: {
              ...(state.appearanceConfig || { topBarIconUris: {}, inputIconUris: {}, inputStyle: 'default' }),
              topBarIconUris: nextUris,
            },
          };
        }),
      resetTopBarIcons: () =>
        set((state) => ({
          appearanceConfig: {
            ...(state.appearanceConfig || { topBarIconUris: {}, inputIconUris: {}, inputStyle: 'default' }),
            topBarIconUris: {},
          },
        })),
      setChatInputIconUri: (key, uri) =>
        set((state) => ({
          appearanceConfig: {
            ...(state.appearanceConfig || { topBarIconUris: {}, inputIconUris: {}, inputStyle: 'default' }),
            inputIconUris: {
              ...(state.appearanceConfig?.inputIconUris || {}),
              [key]: uri,
            },
          },
        })),
      clearChatInputIconUri: (key) =>
        set((state) => {
          const nextUris = { ...(state.appearanceConfig?.inputIconUris || {}) };
          delete nextUris[key];
          return {
            appearanceConfig: {
              ...(state.appearanceConfig || { topBarIconUris: {}, inputIconUris: {}, inputStyle: 'default' }),
              inputIconUris: nextUris,
            },
          };
        }),
      resetChatInputIcons: () =>
        set((state) => ({
          appearanceConfig: {
            ...(state.appearanceConfig || { topBarIconUris: {}, inputIconUris: {}, inputStyle: 'default' }),
            inputIconUris: {},
          },
        })),
      saveAppearanceTheme: (name) => {
        const id = createId('appearance-theme');
        set((state) => {
          const current = state.appearanceConfig || DEFAULT_APPEARANCE_CONFIG;
          const themes = current.appearanceThemes || [];
          const theme: AppearanceTheme = {
            id,
            name: name.trim(),
            updatedAt: Date.now(),
            config: snapshotAppearanceConfig(current),
          };
          return {
            appearanceConfig: {
              ...current,
              appearanceThemes: [theme, ...themes],
              activeAppearanceThemeId: id,
            },
          };
        });
        return id;
      },
      updateAppearanceTheme: (id) =>
        set((state) => {
          const current = state.appearanceConfig || DEFAULT_APPEARANCE_CONFIG;
          const themes = current.appearanceThemes || [];
          return {
            appearanceConfig: {
              ...current,
              appearanceThemes: themes.map((theme) =>
                theme.id === id
                  ? { ...theme, updatedAt: Date.now(), config: snapshotAppearanceConfig(current) }
                  : theme
              ),
              activeAppearanceThemeId: id,
            },
          };
        }),
      applyAppearanceTheme: (id) =>
        set((state) => {
          const current = state.appearanceConfig || DEFAULT_APPEARANCE_CONFIG;
          const themes = current.appearanceThemes || [];
          const theme = themes.find((item) => item.id === id);
          if (!theme) return { appearanceConfig: current };
          return {
            appearanceConfig: {
              ...DEFAULT_APPEARANCE_CONFIG,
              ...theme.config,
              topBarIconUris: { ...(theme.config.topBarIconUris || {}) },
              inputIconUris: { ...(theme.config.inputIconUris || {}) },
              appearanceThemes: themes,
              activeAppearanceThemeId: id,
            },
          };
        }),
      removeAppearanceTheme: (id) =>
        set((state) => {
          const current = state.appearanceConfig || DEFAULT_APPEARANCE_CONFIG;
          const nextThemes = (current.appearanceThemes || []).filter((theme) => theme.id !== id);
          return {
            appearanceConfig: {
              ...current,
              appearanceThemes: nextThemes,
              activeAppearanceThemeId:
                current.activeAppearanceThemeId === id ? undefined : current.activeAppearanceThemeId,
            },
          };
        }),
      resetAppearanceConfig: () => set({ appearanceConfig: createDefaultAppearanceConfig() }),
    }),
    {
      name: 'ysclaude-settings',
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (state) => ({
        apiConfigs: state.apiConfigs,
        activeConfigIndex: state.activeConfigIndex,
        systemPrompt: state.systemPrompt,
        systemPrompts: state.systemPrompts,
        maxOutputTokens: state.maxOutputTokens,
        stripThinking: state.stripThinking,
        ttsConfig: state.ttsConfig,
        memoryVaultConfig: state.memoryVaultConfig,
        webSearchConfig: state.webSearchConfig,
        webPageReaderConfig: state.webPageReaderConfig,
        webInteractionConfig: state.webInteractionConfig,
        hotboardConfig: state.hotboardConfig,
        nativeToolConfig: state.nativeToolConfig,
        shizukuFileConfig: state.shizukuFileConfig,
        readingConfig: state.readingConfig,
        floatingBallConfig: state.floatingBallConfig,
        periodConfig: state.periodConfig,
        promptCacheConfig: state.promptCacheConfig,
        appearanceConfig: state.appearanceConfig,
      }),
      onRehydrateStorage: () => () => {
        useSettingsStore.setState({ _hydrated: true });
      },
    }
  )
);
