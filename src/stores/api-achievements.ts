import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { sqliteStorage } from '../db/kv-storage';

export type ApiAchievementMetric = 'activeDays' | 'totalTokens';
export type ApiAchievementFeatureScope = 'all' | 'chat' | 'reading' | 'radio' | 'game' | 'unknown';
export type ApiAchievementBadgePattern =
  | 'award'
  | 'sparkles'
  | 'heart'
  | 'message'
  | 'book'
  | 'radio'
  | 'game'
  | 'bolt'
  | 'gem';
export type ApiAchievementBadgeColor = 'amber' | 'green' | 'blue' | 'rose' | 'violet' | 'cyan';

export interface ApiAchievementDefinition {
  id: string;
  name: string;
  metric: ApiAchievementMetric;
  feature: ApiAchievementFeatureScope;
  target: number;
  badgePattern: ApiAchievementBadgePattern;
  badgeColor: ApiAchievementBadgeColor;
  createdAt: number;
  updatedAt: number;
}

interface ApiAchievementsState {
  _hydrated: boolean;
  achievements: ApiAchievementDefinition[];
  saveAchievement: (achievement: ApiAchievementDefinition) => void;
  removeAchievement: (id: string) => void;
  resetDefaultAchievements: () => void;
}

const now = 0;

export const DEFAULT_API_ACHIEVEMENTS: ApiAchievementDefinition[] = [
  {
    id: 'default-chat-streak-30',
    name: '连续相伴 30 天',
    metric: 'activeDays',
    feature: 'chat',
    target: 30,
    badgePattern: 'heart',
    badgeColor: 'rose',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'default-total-token-500w',
    name: '总累计 500 万 tokens',
    metric: 'totalTokens',
    feature: 'all',
    target: 5000000,
    badgePattern: 'award',
    badgeColor: 'amber',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'default-chat-token-100w',
    name: '聊天累计 100 万 tokens',
    metric: 'totalTokens',
    feature: 'chat',
    target: 1000000,
    badgePattern: 'message',
    badgeColor: 'blue',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'default-reading-token-20w',
    name: '共读累计 20 万 tokens',
    metric: 'totalTokens',
    feature: 'reading',
    target: 200000,
    badgePattern: 'book',
    badgeColor: 'green',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'default-radio-token-20w',
    name: 'AI 电台累计 20 万 tokens',
    metric: 'totalTokens',
    feature: 'radio',
    target: 200000,
    badgePattern: 'radio',
    badgeColor: 'cyan',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'default-game-token-50w',
    name: '副本累计 50 万 tokens',
    metric: 'totalTokens',
    feature: 'game',
    target: 500000,
    badgePattern: 'game',
    badgeColor: 'violet',
    createdAt: now,
    updatedAt: now,
  },
];

export const useApiAchievementsStore = create<ApiAchievementsState>()(
  persist(
    (set) => ({
      _hydrated: false,
      achievements: DEFAULT_API_ACHIEVEMENTS,

      saveAchievement: (achievement) =>
        set((state) => {
          const exists = state.achievements.some((item) => item.id === achievement.id);
          return {
            achievements: exists
              ? state.achievements.map((item) => (item.id === achievement.id ? achievement : item))
              : [...state.achievements, achievement],
          };
        }),

      removeAchievement: (id) =>
        set((state) => ({
          achievements: state.achievements.filter((item) => item.id !== id),
        })),

      resetDefaultAchievements: () =>
        set({
          achievements: DEFAULT_API_ACHIEVEMENTS.map((item) => ({
            ...item,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })),
        }),
    }),
    {
      name: 'api-achievements-storage',
      storage: createJSONStorage(() => sqliteStorage),
      onRehydrateStorage: () => (state) => {
        if (state) state._hydrated = true;
      },
    }
  )
);
