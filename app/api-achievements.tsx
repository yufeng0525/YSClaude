import { randomUUID } from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { Award, BookOpen, Gamepad2, Gem, Heart, MessageCircle, Radio, Sparkles, Zap } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  getApiUsageActiveDateKeysByFeature,
  getApiUsageSummary,
  getApiUsageSummaryByFeature,
} from '../src/db/operations';
import {
  type ApiAchievementBadgeColor,
  type ApiAchievementBadgePattern,
  type ApiAchievementDefinition,
  type ApiAchievementFeatureScope,
  type ApiAchievementMetric,
  useApiAchievementsStore,
} from '../src/stores/api-achievements';
import { lightColors, useThemeColors, type ThemeColors } from '../src/theme/colors';
import type { ApiUsageGroupSummary, ApiUsageSummary } from '../src/types';

let colors = lightColors;

const EMPTY_SUMMARY: ApiUsageSummary = {
  totalCalls: 0,
  successCalls: 0,
  errorCalls: 0,
  abortedCalls: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedTokens: 0,
  reasoningTokens: 0,
  totalDurationMs: 0,
};

const FEATURE_OPTIONS: Array<{ key: ApiAchievementFeatureScope; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'chat', label: '主聊天' },
  { key: 'reading', label: '共读' },
  { key: 'radio', label: 'AI 电台' },
  { key: 'game', label: '副本' },
  { key: 'unknown', label: '未分类' },
];

const METRIC_OPTIONS: Array<{ key: ApiAchievementMetric; label: string }> = [
  { key: 'activeDays', label: '连续活跃天数' },
  { key: 'totalTokens', label: '累计 tokens' },
];

const BADGE_OPTIONS: Array<{ key: ApiAchievementBadgePattern; label: string }> = [
  { key: 'award', label: '奖章' },
  { key: 'sparkles', label: '星芒' },
  { key: 'heart', label: '陪伴' },
  { key: 'message', label: '聊天' },
  { key: 'book', label: '共读' },
  { key: 'radio', label: '电台' },
  { key: 'game', label: '副本' },
  { key: 'bolt', label: '能量' },
  { key: 'gem', label: '珍藏' },
];

const COLOR_OPTIONS: Array<{ key: ApiAchievementBadgeColor; label: string; colors: [string, string] }> = [
  { key: 'amber', label: '琥珀', colors: ['#F59E0B', '#B45309'] },
  { key: 'green', label: '翠绿', colors: ['#22C55E', '#15803D'] },
  { key: 'blue', label: '蓝色', colors: ['#38BDF8', '#2563EB'] },
  { key: 'rose', label: '玫瑰', colors: ['#FB7185', '#BE123C'] },
  { key: 'violet', label: '紫罗兰', colors: ['#A78BFA', '#6D28D9'] },
  { key: 'cyan', label: '青色', colors: ['#22D3EE', '#0E7490'] },
];

interface AchievementDraft {
  id?: string;
  name: string;
  metric: ApiAchievementMetric;
  feature: ApiAchievementFeatureScope;
  targetText: string;
  badgePattern: ApiAchievementBadgePattern;
  badgeColor: ApiAchievementBadgeColor;
  createdAt?: number;
}

interface EvaluatedAchievement {
  definition: ApiAchievementDefinition;
  current: number;
  target: number;
  progress: number;
  achieved: boolean;
}

export default function ApiAchievementsScreen() {
  colors = useThemeColors();
  styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const achievements = useApiAchievementsStore((state) => state.achievements);
  const saveAchievement = useApiAchievementsStore((state) => state.saveAchievement);
  const removeAchievement = useApiAchievementsStore((state) => state.removeAchievement);
  const resetDefaultAchievements = useApiAchievementsStore((state) => state.resetDefaultAchievements);
  const [summary, setSummary] = useState<ApiUsageSummary>(EMPTY_SUMMARY);
  const [featureRows, setFeatureRows] = useState<ApiUsageGroupSummary[]>([]);
  const [activeDateKeys, setActiveDateKeys] = useState<Record<ApiAchievementFeatureScope, string[]>>({
    all: [],
    chat: [],
    reading: [],
    radio: [],
    game: [],
    unknown: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AchievementDraft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextFeatureRows, activePairs] = await Promise.all([
        getApiUsageSummary(),
        getApiUsageSummaryByFeature(),
        Promise.all(FEATURE_OPTIONS.map(async (option) => [
          option.key,
          await getApiUsageActiveDateKeysByFeature(option.key),
        ] as const)),
      ]);
      setSummary(nextSummary);
      setFeatureRows(nextFeatureRows);
      setActiveDateKeys(Object.fromEntries(activePairs) as Record<ApiAchievementFeatureScope, string[]>);
    } catch (err: any) {
      setError(err?.message || '无法读取 API 成就数据');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load])
  );

  const evaluatedRows = useMemo(
    () => achievements.map((definition) => evaluateAchievement(definition, summary, featureRows, activeDateKeys)),
    [achievements, activeDateKeys, featureRows, summary]
  );
  const earnedCount = evaluatedRows.filter((row) => row.achieved).length;

  const openCreate = useCallback(() => {
    setDraft({
      name: '',
      metric: 'totalTokens',
      feature: 'all',
      targetText: '1000000',
      badgePattern: 'award',
      badgeColor: 'amber',
    });
  }, []);

  const openEdit = useCallback((definition: ApiAchievementDefinition) => {
    setDraft({
      id: definition.id,
      name: definition.name,
      metric: definition.metric,
      feature: definition.feature,
      targetText: String(definition.target),
      badgePattern: definition.badgePattern,
      badgeColor: definition.badgeColor,
      createdAt: definition.createdAt,
    });
  }, []);

  const saveDraft = useCallback(() => {
    if (!draft) return;
    const name = draft.name.trim();
    const target = Math.floor(Number(draft.targetText.replace(/,/g, '')));
    if (!name) {
      Alert.alert('提示', '请填写成就名称');
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      Alert.alert('提示', '目标数需要大于 0');
      return;
    }
    const now = Date.now();
    saveAchievement({
      id: draft.id || randomUUID(),
      name,
      metric: draft.metric,
      feature: draft.feature,
      target,
      badgePattern: draft.badgePattern,
      badgeColor: draft.badgeColor,
      createdAt: draft.createdAt || now,
      updatedAt: now,
    });
    setDraft(null);
  }, [draft, saveAchievement]);

  const deleteDraft = useCallback(() => {
    if (!draft?.id) return;
    Alert.alert('删除成就', '删除后可以通过恢复默认成就重新生成默认项。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          removeAchievement(draft.id!);
          setDraft(null);
        },
      },
    ]);
  }, [draft, removeAchievement]);

  const confirmReset = useCallback(() => {
    Alert.alert('恢复默认成就', '这会用默认成就列表覆盖当前自定义列表。', [
      { text: '取消', style: 'cancel' },
      { text: '恢复', onPress: resetDefaultAchievements },
    ]);
  }, [resetDefaultAchievements]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Text style={styles.headerButtonText}>返回</Text>
        </Pressable>
        <Text style={styles.title}>成就徽章</Text>
        <Pressable style={styles.headerButton} onPress={openCreate}>
          <Text style={styles.headerButtonText}>新增</Text>
        </Pressable>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.overviewPanel}>
          <View>
            <Text style={styles.overviewTitle}>徽章墙</Text>
            <Text style={styles.overviewMeta}>已获得 {earnedCount}/{evaluatedRows.length}</Text>
          </View>
          <View style={styles.overviewStats}>
            <Text style={styles.overviewNumber}>{formatNumber(summary.totalTokens)}</Text>
            <Text style={styles.overviewLabel}>累计 tokens</Text>
          </View>
        </View>

        {loading && evaluatedRows.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={styles.badgeGrid}>
            {evaluatedRows.map((row) => (
              <Pressable key={row.definition.id} style={styles.badgeCard} onPress={() => openEdit(row.definition)}>
                <BadgeMedal
                  pattern={row.definition.badgePattern}
                  color={row.definition.badgeColor}
                  achieved={row.achieved}
                />
                <Text style={styles.badgeName} numberOfLines={2}>{row.definition.name}</Text>
                <Text style={styles.badgeCondition} numberOfLines={2}>{formatCondition(row.definition)}</Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      row.achieved && styles.progressFillAchieved,
                      { width: `${Math.round(row.progress * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.badgeProgress}>
                  {formatMetricValue(row.current, row.definition.metric)} / {formatMetricValue(row.target, row.definition.metric)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {evaluatedRows.length === 0 && !loading && (
          <Text style={styles.emptyText}>还没有成就。点右上角新增一个徽章。</Text>
        )}

        <Pressable style={styles.resetButton} onPress={confirmReset}>
          <Text style={styles.resetButtonText}>恢复默认成就</Text>
        </Pressable>
      </ScrollView>

      <AchievementEditor
        draft={draft}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onSave={saveDraft}
        onDelete={deleteDraft}
      />
    </View>
  );
}

function AchievementEditor({
  draft,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  draft: AchievementDraft | null;
  onChange: (draft: AchievementDraft | null) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  if (!draft) return null;
  const update = (patch: Partial<AchievementDraft>) => onChange({ ...draft, ...patch });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.editorPanel}>
          <View style={styles.editorHeader}>
            <Text style={styles.editorTitle}>{draft.id ? '编辑成就' : '新增成就'}</Text>
            <Pressable style={styles.editorCloseButton} onPress={onClose}>
              <Text style={styles.editorCloseText}>关闭</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorContent}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>成就名称</Text>
              <TextInput
                style={styles.input}
                value={draft.name}
                onChangeText={(name) => update({ name })}
                placeholder="例如：夜航 100 万 tokens"
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>条件</Text>
              <View style={styles.segmentRow}>
                {METRIC_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    style={[styles.segmentButton, draft.metric === option.key && styles.segmentButtonActive]}
                    onPress={() => update({ metric: option.key, targetText: option.key === 'activeDays' ? '30' : '1000000' })}
                  >
                    <Text style={[styles.segmentText, draft.metric === option.key && styles.segmentTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>范围</Text>
              <View style={styles.optionWrap}>
                {FEATURE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    style={[styles.optionChip, draft.feature === option.key && styles.optionChipActive]}
                    onPress={() => update({ feature: option.key })}
                  >
                    <Text style={[styles.optionChipText, draft.feature === option.key && styles.optionChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>目标数</Text>
              <TextInput
                style={styles.input}
                value={draft.targetText}
                onChangeText={(targetText) => update({ targetText })}
                keyboardType="number-pad"
                placeholder={draft.metric === 'activeDays' ? '30' : '1000000'}
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>徽章图案</Text>
              <View style={styles.badgePickerGrid}>
                {BADGE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    style={[styles.badgePickerItem, draft.badgePattern === option.key && styles.badgePickerItemActive]}
                    onPress={() => update({ badgePattern: option.key })}
                  >
                    <BadgeMedal pattern={option.key} color={draft.badgeColor} achieved size="small" />
                    <Text style={styles.badgePickerText}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>徽章配色</Text>
              <View style={styles.optionWrap}>
                {COLOR_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    style={[styles.colorChip, draft.badgeColor === option.key && styles.colorChipActive]}
                    onPress={() => update({ badgeColor: option.key })}
                  >
                    <LinearGradient colors={option.colors} style={styles.colorSwatch} />
                    <Text style={[styles.optionChipText, draft.badgeColor === option.key && styles.optionChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.editorActions}>
              {draft.id && (
                <Pressable style={styles.deleteButton} onPress={onDelete}>
                  <Text style={styles.deleteButtonText}>删除</Text>
                </Pressable>
              )}
              <Pressable style={styles.saveButton} onPress={onSave}>
                <Text style={styles.saveButtonText}>保存</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function BadgeMedal({
  pattern,
  color,
  achieved,
  size = 'large',
}: {
  pattern: ApiAchievementBadgePattern;
  color: ApiAchievementBadgeColor;
  achieved: boolean;
  size?: 'large' | 'small';
}) {
  const palette = COLOR_OPTIONS.find((item) => item.key === color)?.colors || COLOR_OPTIONS[0].colors;
  const medalSize = size === 'large' ? 76 : 48;
  const iconSize = size === 'large' ? 34 : 22;
  return (
    <View style={[styles.medalShell, { width: medalSize, height: medalSize, opacity: achieved ? 1 : 0.38 }]}>
      <LinearGradient colors={achieved ? palette : ['#D1D5DB', '#9CA3AF']} style={styles.medalGradient}>
        <BadgeIcon pattern={pattern} size={iconSize} color="#FFFFFF" />
      </LinearGradient>
    </View>
  );
}

function BadgeIcon({ pattern, size, color }: { pattern: ApiAchievementBadgePattern; size: number; color: string }) {
  const common = { size, color, strokeWidth: 2.4 };
  if (pattern === 'sparkles') return <Sparkles {...common} />;
  if (pattern === 'heart') return <Heart {...common} />;
  if (pattern === 'message') return <MessageCircle {...common} />;
  if (pattern === 'book') return <BookOpen {...common} />;
  if (pattern === 'radio') return <Radio {...common} />;
  if (pattern === 'game') return <Gamepad2 {...common} />;
  if (pattern === 'bolt') return <Zap {...common} />;
  if (pattern === 'gem') return <Gem {...common} />;
  return <Award {...common} />;
}

function evaluateAchievement(
  definition: ApiAchievementDefinition,
  summary: ApiUsageSummary,
  featureRows: ApiUsageGroupSummary[],
  activeDateKeys: Record<ApiAchievementFeatureScope, string[]>
): EvaluatedAchievement {
  const current = definition.metric === 'activeDays'
    ? calculateLongestDateStreak(activeDateKeys[definition.feature] || [])
    : getTokenTotal(definition.feature, summary, featureRows);
  const target = Math.max(1, definition.target);
  const progress = Math.min(1, current / target);
  return {
    definition,
    current,
    target,
    progress,
    achieved: current >= target,
  };
}

function getTokenTotal(
  feature: ApiAchievementFeatureScope,
  summary: ApiUsageSummary,
  featureRows: ApiUsageGroupSummary[]
): number {
  if (feature === 'all') return summary.totalTokens;
  return featureRows.find((row) => row.key === feature)?.totalTokens ?? 0;
}

function calculateLongestDateStreak(dateKeys: string[]): number {
  const dayIndexes = [...new Set(dateKeys)]
    .map(dayIndexFromKey)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  let longest = 0;
  let current = 0;
  let previous: number | null = null;

  dayIndexes.forEach((dayIndex) => {
    current = previous !== null && dayIndex === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = dayIndex;
  });

  return longest;
}

function dayIndexFromKey(key: string): number {
  const [year, month, day] = key.split('-').map((part) => parseInt(part, 10));
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function formatCondition(definition: ApiAchievementDefinition): string {
  const scope = FEATURE_OPTIONS.find((item) => item.key === definition.feature)?.label || '全部';
  const metric = definition.metric === 'activeDays' ? '连续活跃' : '累计 tokens';
  return `${scope} · ${metric}`;
}

function formatMetricValue(value: number, metric: ApiAchievementMetric): string {
  if (metric === 'activeDays') return `${formatNumber(value)} 天`;
  return `${formatCompactNumber(value)} tokens`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 76,
    minHeight: 36,
    justifyContent: 'center',
  },
  headerButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  overviewPanel: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  overviewTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  overviewMeta: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  overviewStats: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },
  overviewNumber: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  overviewLabel: {
    marginTop: 4,
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '700',
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeCard: {
    width: '48%',
    minWidth: 154,
    flexGrow: 1,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  medalShell: {
    borderRadius: 999,
    padding: 5,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  medalGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  badgeName: {
    marginTop: 9,
    minHeight: 36,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  badgeCondition: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    marginTop: 10,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  progressFill: {
    height: '100%',
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  progressFillAchieved: {
    backgroundColor: colors.success,
  },
  badgeProgress: {
    marginTop: 7,
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  resetButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  loading: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.dangerSurface,
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textTertiary,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 28,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  editorPanel: {
    maxHeight: '90%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  editorTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  editorCloseButton: {
    minHeight: 32,
    justifyContent: 'center',
  },
  editorCloseText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  editorContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 14,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: 8,
  },
  segmentButtonActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  segmentTextActive: {
    color: colors.primary,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: 11,
  },
  optionChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  optionChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  optionChipTextActive: {
    color: colors.primary,
  },
  badgePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgePickerItem: {
    width: '30%',
    minWidth: 90,
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    padding: 10,
  },
  badgePickerItemActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  badgePickerText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  colorChip: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 8,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: 10,
  },
  colorChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  colorSwatch: {
    width: 18,
    height: 18,
    borderRadius: 999,
  },
  editorActions: {
    flexDirection: 'row',
    gap: 10,
  },
  deleteButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.dangerSurface,
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '900',
  },
  saveButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});

let styles = createStyles(colors);
