import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { McpToolConfig } from '../stores/settings';
import type { Message } from '../types';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import {
  buildLocalFishingEntries,
  fetchFishingLog,
  inferFishingSessionId,
  resolveFishingServer,
  type FishingLogEntry,
  type FishingState,
} from '../services/fishingLog';

interface FishingFloatingPanelProps {
  visible: boolean;
  messages: Message[];
  mcpToolConfig?: McpToolConfig;
  onClose: () => void;
}

const PANEL_HEIGHT = 390;
const POLL_INTERVAL_MS = 5000;

export function FishingFloatingPanel({
  visible,
  messages,
  mcpToolConfig,
  onClose,
}: FishingFloatingPanelProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dimensions = useWindowDimensions();
  const panelWidth = Math.min(430, Math.max(300, dimensions.width - 24));
  const position = useRef(new Animated.ValueXY({ x: 12, y: 96 })).current;
  const [serverEntries, setServerEntries] = useState<FishingLogEntry[]>([]);
  const [serverState, setServerState] = useState<FishingState | null>(null);
  const [runId, setRunId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const connection = useMemo(() => resolveFishingServer(mcpToolConfig), [mcpToolConfig]);
  const sessionId = useMemo(() => inferFishingSessionId(messages), [messages]);
  const localEntries = useMemo(() => buildLocalFishingEntries(messages), [messages]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
      onPanResponderGrant: () => {
        position.extractOffset();
      },
      onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        position.flattenOffset();
      },
      onPanResponderTerminate: () => {
        position.flattenOffset();
      },
    }),
    [position]
  );

  const refresh = async () => {
    if (!connection) {
      setServerEntries([]);
      setServerState(null);
      setRunId(undefined);
      setError('未找到已启用的 Fishing MCP 服务');
      return;
    }
    setLoading(true);
    try {
      const payload = await fetchFishingLog(connection, sessionId, 200);
      setServerEntries((payload.entries || []).map((entry) => ({ ...entry, origin: 'server', status: 'done' })));
      setServerState(payload.state || null);
      setRunId(payload.run_id);
      setError(null);
    } catch (err: any) {
      setError(err?.message || '钓鱼日志读取失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    refresh().catch(() => undefined);
    const timer = setInterval(() => {
      refresh().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [visible, sessionId, connection?.baseUrl, connection?.authorization]);

  const entries = useMemo(
    () => mergeEntries(serverEntries, localEntries),
    [serverEntries, localEntries]
  );
  const latestState = serverState || [...entries].reverse().find((entry) => entry.state)?.state || null;

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.panel,
        {
          width: panelWidth,
          height: PANEL_HEIGHT,
          transform: position.getTranslateTransform(),
        },
      ]}
    >
      <View style={styles.dragHeader} {...panResponder.panHandlers}>
        <View style={styles.dragHandle} />
        <View style={styles.headerContent}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.kicker}>钓鱼观察窗</Text>
            <Text style={styles.title} numberOfLines={1}>
              {formatPlace(latestState)}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.iconButton} onPress={() => refresh().catch(() => undefined)}>
              <Text style={styles.iconButtonText}>{loading ? '...' : '刷新'}</Text>
            </Pressable>
            <Pressable style={styles.iconButton} onPress={onClose}>
              <Text style={styles.iconButtonText}>关闭</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.statusBar}>
        <Status label="Session" value={sessionId} styles={styles} wide />
        <Status label="点数" value={formatPoints(latestState)} styles={styles} />
        <Status label="图鉴" value={latestState?.enc || '-'} styles={styles} />
        <Status label="回合" value={formatMaybeNumber(latestState?.turn)} styles={styles} />
      </View>

      {!!runId && <Text style={styles.metaText} numberOfLines={1}>run: {runId}</Text>}
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <ScrollView
        style={styles.logScroll}
        contentContainerStyle={styles.logContent}
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>还没有钓鱼记录</Text>
            <Text style={styles.emptyText}>让 AI 调用 play_fishing 后，这里会显示它的行动日志。</Text>
          </View>
        ) : (
          entries.map((entry) => (
            <View key={`${entry.origin || 'log'}-${entry.id}`} style={styles.entryRow}>
              <View style={[styles.dot, entry.status === 'running' && styles.dotRunning]} />
              <View style={styles.entryBody}>
                <View style={styles.entryTopRow}>
                  <Text style={styles.entryCommand} numberOfLines={1}>{entry.command}</Text>
                  <Text style={styles.entrySource}>{entry.origin === 'local' ? '本地' : '服务器'}</Text>
                </View>
                <Text style={styles.entrySummary}>{entry.summary}</Text>
                {entry.state && (
                  <Text style={styles.entryState} numberOfLines={1}>
                    {formatPlace(entry.state)} · {formatPoints(entry.state)} · 图鉴 {entry.state.enc || '-'}
                  </Text>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Animated.View>
  );
}

function Status({
  label,
  value,
  styles,
  wide = false,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
  wide?: boolean;
}) {
  return (
    <View style={[styles.statusItem, wide && styles.statusItemWide]}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function mergeEntries(serverEntries: FishingLogEntry[], localEntries: FishingLogEntry[]): FishingLogEntry[] {
  const seen = new Set(serverEntries.map((entry) => entryKey(entry)));
  const pendingLocal = localEntries.filter((entry) => entry.status === 'running' || !seen.has(entryKey(entry)));
  return [...serverEntries, ...pendingLocal]
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
    .slice(-260);
}

function entryKey(entry: FishingLogEntry): string {
  return `${entry.command}\n${entry.summary}`;
}

function formatPlace(state?: FishingState | null): string {
  if (!state) return '等待钓鱼记录';
  return [state.loc, state.sea].filter(Boolean).join(' · ') || '钓鱼进行中';
}

function formatPoints(state?: FishingState | null): string {
  return typeof state?.pts === 'number' ? `${state.pts}` : '-';
}

function formatMaybeNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '-';
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  dragHeader: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconButton: {
    minHeight: 32,
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
  },
  iconButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  statusBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  statusItem: {
    minWidth: 58,
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  statusItemWide: {
    minWidth: 110,
    flex: 1,
  },
  statusLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '800',
  },
  statusValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  metaText: {
    color: colors.textTertiary,
    fontSize: 11,
    paddingHorizontal: 12,
    paddingTop: 6,
    fontFamily: fonts.mono,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  logScroll: {
    flex: 1,
    marginTop: 8,
  },
  logContent: {
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  entryRow: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  dotRunning: {
    backgroundColor: colors.textTertiary,
  },
  entryBody: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: 9,
  },
  entryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  entryCommand: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    fontFamily: fonts.mono,
  },
  entrySource: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '800',
  },
  entrySummary: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  entryState: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 5,
    fontVariant: ['tabular-nums'],
  },
  emptyState: {
    minHeight: 150,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 6,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
