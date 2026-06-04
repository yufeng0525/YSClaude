import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Image,
  Dimensions,
  PanResponder,
} from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { lightColors, useThemeColors, type ThemeColors } from '../../src/theme/colors';

import { fonts } from '../../src/theme/fonts';
import { ReadingBook, ReadingMessage } from '../../src/types';
import {
  deleteReadingMessage,
  getReadingBook,
  getReadingMessages,
  insertReadingMessage,
  updateReadingBook,
  updateReadingMessageContent,
} from '../../src/db/operations';
import { streamChat } from '../../src/services/api';
import { notifyReplyReady } from '../../src/services/notifications';
import { useSettingsStore } from '../../src/stores/settings';


let colors = lightColors;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_MIN_WIDTH = 260;
const PANEL_MIN_HEIGHT = 220;
const PANEL_DEFAULT_WIDTH = Math.min(360, SCREEN_WIDTH - 24);
const PANEL_DEFAULT_HEIGHT = 300;
const PANEL_MARGIN = 12;
const HEADER_HEIGHT = 96;
const BALL_SIZE = 58;

interface PanelFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

const INITIAL_PANEL_FRAME: PanelFrame = {
  x: PANEL_MARGIN,
  y: Math.max(HEADER_HEIGHT + 12, SCREEN_HEIGHT - PANEL_DEFAULT_HEIGHT - 28),
  width: PANEL_DEFAULT_WIDTH,
  height: PANEL_DEFAULT_HEIGHT,
};

export default function ReadingBookScreen() {
  colors = useThemeColors();
  styles = useMemo(() => createStyles(colors), [colors]);

  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const readingConfig = useSettingsStore((state) => state.readingConfig);
  const maxOutputTokens = useSettingsStore((state) => state.maxOutputTokens);
  const [book, setBook] = useState<ReadingBook | null>(null);
  const [messages, setMessages] = useState<ReadingMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [panelFrame, setPanelFrameState] = useState<PanelFrame>(INITIAL_PANEL_FRAME);
  const [editingMessage, setEditingMessage] = useState<ReadingMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [visibleFloorMessageId, setVisibleFloorMessageId] = useState<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryFrom, setSummaryFrom] = useState('');
  const [summaryTo, setSummaryTo] = useState('');
  const [summaryText, setSummaryText] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const messageScrollRef = useRef<ScrollView>(null);
  const summaryAbortRef = useRef<AbortController | null>(null);
  const contentHeightRef = useRef(1);
  const viewportHeightRef = useRef(1);
  const readingOffsetRef = useRef(0);
  const didRestoreScrollRef = useRef(false);
  const panelFrameRef = useRef(INITIAL_PANEL_FRAME);
  const dragStartRef = useRef(INITIAL_PANEL_FRAME);
  const resizeStartRef = useRef(INITIAL_PANEL_FRAME);
  const collapsedRef = useRef(false);
  const ballMovedRef = useRef(false);

  const updatePanelFrame = useCallback((nextFrame: PanelFrame, mode: 'panel' | 'ball' = 'panel') => {
    const next = mode === 'ball' ? clampBallFrame(nextFrame) : clampFrame(nextFrame);
    panelFrameRef.current = next;
    setPanelFrameState(next);
  }, []);

  const handleSetCollapsed = useCallback((value: boolean) => {
    collapsedRef.current = value;
    setCollapsed(value);
  }, []);

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => collapsedRef.current,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragStartRef.current = panelFrameRef.current;
          ballMovedRef.current = false;
        },
        onPanResponderMove: (_event, gesture) => {
          const start = dragStartRef.current;
          if (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3) {
            ballMovedRef.current = true;
          }
          updatePanelFrame(
            {
              ...start,
              x: start.x + gesture.dx,
              y: start.y + gesture.dy,
            },
            collapsedRef.current ? 'ball' : 'panel'
          );
        },
        onPanResponderRelease: () => {
          if (collapsedRef.current && !ballMovedRef.current) {
            handleSetCollapsed(false);
          }
        },
      }),
    [handleSetCollapsed, updatePanelFrame]
  );

  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          resizeStartRef.current = panelFrameRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const start = resizeStartRef.current;
          updatePanelFrame({
              ...start,
              width: start.width + gesture.dx,
              height: start.height + gesture.dy,
            });
        },
      }),
    [updatePanelFrame]
  );

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      async function load() {
        if (!id) return;
        setLoading(true);
        const [nextBook, nextMessages] = await Promise.all([
          getReadingBook(id),
          getReadingMessages(id),
        ]);
        if (!mounted) return;
        setBook(nextBook);
        setMessages(nextMessages);
        readingOffsetRef.current = nextBook?.readingOffset || 0;
        didRestoreScrollRef.current = false;
        setError(null);
        setLoading(false);
      }
      load();
      return () => {
        mounted = false;
      };
    }, [id])
  );

  const currentChapter = useMemo(() => {
    if (!book || book.chapters.length === 0) return null;
    const offset = readingOffsetRef.current;
    let chapter = book.chapters[0];
    for (const item of book.chapters) {
      if (item.start <= offset) chapter = item;
      else break;
    }
    return chapter;
  }, [book, messages.length]);

  const messageFloorMap = useMemo(() => {
    const map = new Map<string, number>();
    messages.forEach((message, index) => {
      map.set(message.id, index + 1);
    });
    return map;
  }, [messages]);

  const summaryRangeHint = messages.length > 0 ? `可总结楼层：1-${messages.length}` : '暂无聊天记录';

  function handleContentSizeChange(_width: number, height: number) {
    contentHeightRef.current = Math.max(1, height);
    if (!book || didRestoreScrollRef.current || book.readingOffset <= 0 || book.text.length <= 0) {
      return;
    }
    didRestoreScrollRef.current = true;
    const scrollableHeight = Math.max(1, height - viewportHeightRef.current);
    const y = (book.readingOffset / book.text.length) * scrollableHeight;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: false });
    });
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!book) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    viewportHeightRef.current = Math.max(1, layoutMeasurement.height);
    contentHeightRef.current = Math.max(1, contentSize.height);
    const endY = Math.min(contentOffset.y + layoutMeasurement.height, contentSize.height);
    const ratio = contentSize.height > 0 ? endY / contentSize.height : 0;
    readingOffsetRef.current = clamp(Math.round(book.text.length * ratio), 0, book.text.length);
  }

  async function persistReadingOffset() {
    if (!book) return;
    const nextOffset = readingOffsetRef.current;
    if (Math.abs(nextOffset - book.readingOffset) < 20) return;
    const updatedAt = Date.now();
    await updateReadingBook(book.id, {
      readingOffset: nextOffset,
      updatedAt,
    });
    setBook({ ...book, readingOffset: nextOffset, updatedAt });
  }

  async function handleSubmitUserMessage() {
    const content = input.trim();
    if (!book || !content || isStreaming) return;

    const userMessage: ReadingMessage = {
      id: randomUUID(),
      bookId: book.id,
      role: 'user',
      content,
      createdAt: Date.now(),
    };

    setInput('');
    setError(null);
    setMessages((current) => [...current, userMessage]);
    await insertReadingMessage(userMessage);
    await persistReadingOffset();
    scrollMessagesToEnd();
  }

  async function handleRequestAIReply() {
    if (!book || isStreaming) return;

    const conversationMessages = messages.filter(
      (message) => message.role === 'user' || message.role === 'assistant'
    );
    const lastMessage = conversationMessages[conversationMessages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      setError('请先发送一条消息，再调用 AI 回复');
      return;
    }

    if (!readingConfig.baseUrl || !readingConfig.apiKey || !readingConfig.model) {
      setError('请先在共读设置中配置 API');
      return;
    }

    setError(null);
    setIsStreaming(true);

    const assistantMessage: ReadingMessage = {
      id: randomUUID(),
      bookId: book.id,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
    };

    const previousMessages = messages;
    const nextMessages = [...previousMessages, assistantMessage];
    setMessages(nextMessages);
    await insertReadingMessage(assistantMessage);
    await persistReadingOffset();
    scrollMessagesToEnd();

    const source = buildSourceExcerpt(book.text, readingOffsetRef.current, readingConfig.sourceCharLimit);
    const recentMessages = previousMessages.slice(-readingConfig.conversationMessageLimit);
    const systemContent = [
      readingConfig.systemPrompt,
      '',
      `书名：${book.title || '未命名书籍'}`,
      `作者：${book.author || '未知作者'}`,
      '',
      `当前阅读位置向前截取的原文：\n${source || '（暂无可用原文）'}`,
    ].join('\n');

    try {
      let assistantContent = '';
      await streamChat(
        {
          baseUrl: readingConfig.baseUrl,
          apiKey: readingConfig.apiKey,
          model: readingConfig.model,
          messages: [
            { role: 'system', content: systemContent },
            ...recentMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          ],
        },
        (token) => {
          assistantContent += token;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: assistantContent }
                : message
            )
          );
        }
      );
      await updateReadingMessageContent(assistantMessage.id, assistantContent);
      await updateReadingBook(book.id, { updatedAt: Date.now() });
      if (assistantContent.trim()) {
        notifyReplyReady(assistantContent).catch(() => {});
      }
    } catch (err: any) {
      const message = err?.message || '请求失败';
      setError(message);
      await updateReadingMessageContent(assistantMessage.id, message);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessage.id ? { ...item, content: message } : item
        )
      );
    } finally {
      setIsStreaming(false);
      scrollMessagesToEnd();
    }
  }

  function openMessageEditor(message: ReadingMessage) {
    setEditingMessage(message);
    setEditText(message.content);
  }

  async function handleSaveMessageEdit() {
    if (!editingMessage) return;
    const nextContent = editText.trim();
    if (!nextContent) {
      Alert.alert('提示', '消息内容不能为空');
      return;
    }
    await updateReadingMessageContent(editingMessage.id, nextContent);
    setMessages((current) =>
      current.map((message) =>
        message.id === editingMessage.id ? { ...message, content: nextContent } : message
      )
    );
    setEditingMessage(null);
  }

  function handleDeleteMessage() {
    if (!editingMessage) return;
    Alert.alert('删除消息', '确定删除这条共读消息？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteReadingMessage(editingMessage.id);
          setMessages((current) => current.filter((message) => message.id !== editingMessage.id));
          setEditingMessage(null);
        },
      },
    ]);
  }

  function scrollMessagesToEnd() {
    requestAnimationFrame(() => {
      messageScrollRef.current?.scrollToEnd({ animated: true });
    });
  }

  function handleOpenSummary() {
    if (messages.length === 0) {
      Alert.alert('提示', '当前书籍还没有可总结的共读聊天记录');
      return;
    }
    setSummaryFrom('1');
    setSummaryTo(String(messages.length));
    setSummaryText('');
    setSummaryVisible(true);
  }

  function handleCloseSummary() {
    if (isSummarizing) return;
    setSummaryVisible(false);
  }

  function handleStopSummary() {
    summaryAbortRef.current?.abort();
    setIsSummarizing(false);
  }

  async function handleSummarizeMessages() {
    if (!readingConfig.baseUrl || !readingConfig.apiKey || !readingConfig.model) {
      Alert.alert('提示', '请先在共读设置中配置 API');
      return;
    }

    const total = messages.length;
    if (total === 0) {
      Alert.alert('提示', '当前书籍还没有可总结的共读聊天记录');
      return;
    }

    let from = parseInt(summaryFrom, 10);
    let to = parseInt(summaryTo, 10);
    if (Number.isNaN(from)) from = 1;
    if (Number.isNaN(to)) to = total;
    from = clamp(from, 1, total);
    to = clamp(to, 1, total);

    if (from > to) {
      Alert.alert('提示', '请输入有效的楼层范围（起始楼层不能大于结束楼层）');
      return;
    }

    const selectedMessages = messages.filter((_, index) => {
      const floor = index + 1;
      return floor >= from && floor <= to;
    });

    const conversationText = selectedMessages
      .map((message) => {
        const floor = messageFloorMap.get(message.id) ?? 0;
        const speaker = message.role === 'user' ? '用户' : 'AI';
        return `#${floor} ${speaker}：${message.content.trim() || '（空消息）'}`;
      })
      .join('\n\n');

    setSummaryText('');
    setIsSummarizing(true);
    summaryAbortRef.current = new AbortController();

    try {
      await streamChat(
        {
          baseUrl: readingConfig.baseUrl,
          apiKey: readingConfig.apiKey,
          model: readingConfig.model,
          messages: [
            {
              role: 'system',
              content: '你只根据用户提供的聊天记录做总结，不补充书籍原文、阅读位置或外部信息。',
            },
            {
              role: 'user',
              content:
                `请总结下面第 ${from} 层到第 ${to} 层的 AI 共读聊天记录。` +
                '输出中文总结，保留关键问题、回答、结论和待继续讨论的点。只总结聊天记录本身。\n\n' +
                conversationText,
            },
          ],
          maxTokens: maxOutputTokens || undefined,
        },
        (token) => setSummaryText((current) => current + token),
        summaryAbortRef.current.signal
      );
    } catch (err: any) {
      if (!isAbortError(err)) {
        Alert.alert('总结失败', err?.message || '请求失败');
      }
    } finally {
      setIsSummarizing(false);
      summaryAbortRef.current = null;
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!book) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>没有找到这本书</Text>
        <Pressable style={styles.backButtonPill} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>返回书架</Text>
        </Pressable>
      </View>
    );
  }

  const panelStyle = {
    left: panelFrame.x,
    top: panelFrame.y,
    width: panelFrame.width,
    height: panelFrame.height,
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title} numberOfLines={1}>{book.title || '未命名书籍'}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {currentChapter?.title || book.author || 'AI 共读'}
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.reader}
        contentContainerStyle={styles.readerContent}
        onScroll={handleScroll}
        onScrollEndDrag={persistReadingOffset}
        onMomentumScrollEnd={persistReadingOffset}
        onContentSizeChange={handleContentSizeChange}
        scrollEventThrottle={48}
      >
        <Text style={styles.bookHeading}>{book.title || '未命名书籍'}</Text>
        {!!book.author && <Text style={styles.bookSubheading}>{book.author}</Text>}
        <Text style={styles.bodyText}>{book.text}</Text>
      </ScrollView>

      {collapsed ? (
        <View
          style={[styles.floatBall, { left: panelFrame.x, top: panelFrame.y }]}
          {...dragResponder.panHandlers}
        >
          <Image source={require('../../assets/reading.png')} style={styles.floatBallIcon} resizeMode="contain" />
        </View>
      ) : (
        <View style={[styles.chatPanel, panelStyle]}>
          <View style={styles.panelHeader} {...dragResponder.panHandlers}>
            <View>
              <Text style={styles.panelTitle}>共读对话</Text>
              <Text style={styles.panelSubtitle}>回车发送，按钮获取 AI 回复</Text>
            </View>
            <View style={styles.panelActions}>
              <Pressable
                style={[styles.summaryButton, messages.length === 0 && styles.summaryButtonDisabled]}
                onPress={handleOpenSummary}
                disabled={messages.length === 0}
              >
                <Text style={styles.summaryButtonText}>总结</Text>
              </Pressable>
              <Pressable style={styles.collapseButton} onPress={() => handleSetCollapsed(true)}>
                <Text style={styles.collapseButtonText}>−</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            ref={messageScrollRef}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            onContentSizeChange={scrollMessagesToEnd}
          >
            {messages.length === 0 ? (
              <Text style={styles.chatEmpty}>读到哪里，就从哪里问起。</Text>
            ) : (
              messages.map((message) => {
                const floorNumber = messageFloorMap.get(message.id);
                const showFloorNumber = visibleFloorMessageId === message.id && floorNumber !== undefined;
                const isUser = message.role === 'user';

                return (
                  <View
                    key={message.id}
                    style={[
                      styles.messageRow,
                      isUser ? styles.userMessageRow : styles.assistantMessageRow,
                    ]}
                  >
                    {isUser && showFloorNumber && (
                      <Text style={styles.messageFloorLeft}>#{floorNumber}</Text>
                    )}
                    <Pressable
                      style={[
                        styles.messageBubble,
                        isUser ? styles.userBubble : styles.assistantBubble,
                      ]}
                      onPress={() =>
                        setVisibleFloorMessageId((current) =>
                          current === message.id ? null : message.id
                        )
                      }
                      onLongPress={() => openMessageEditor(message)}
                    >
                      <Text style={styles.messageText}>
                        {message.content || (isStreaming && message.role === 'assistant' ? '正在思考…' : '')}
                      </Text>
                    </Pressable>
                    {!isUser && showFloorNumber && (
                      <Text style={styles.messageFloorRight}>#{floorNumber}</Text>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.chatInput}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSubmitUserMessage}
              returnKeyType="send"
              blurOnSubmit
              placeholder="输入后按回车发送"
              placeholderTextColor={colors.textTertiary}
            />
            <Pressable
              style={[styles.aiButton, isStreaming && styles.sendButtonDisabled]}
              onPress={handleRequestAIReply}
              disabled={isStreaming}
            >
              {isStreaming ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.aiButtonText}>AI</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.resizeHandle} {...resizeResponder.panHandlers}>
            <Text style={styles.resizeHandleText}>⌟</Text>
          </View>
        </View>
      )}

      <Modal
        visible={summaryVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSummary}
      >
        <Pressable style={styles.overlay} onPress={handleCloseSummary}>
          <View style={styles.summaryModal} onStartShouldSetResponder={() => true}>
            <View style={styles.summaryModalHeader}>
              <View>
                <Text style={styles.modalTitle}>总结共读聊天</Text>
                <Text style={styles.summaryHint}>{summaryRangeHint}</Text>
              </View>
              <Pressable
                style={[styles.summaryCloseButton, isSummarizing && styles.summaryButtonDisabled]}
                onPress={handleCloseSummary}
                disabled={isSummarizing}
              >
                <Text style={styles.summaryCloseText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.summaryRangeRow}>
              <Text style={styles.summaryRangeLabel}>从第</Text>
              <TextInput
                style={styles.summaryRangeInput}
                value={summaryFrom}
                onChangeText={setSummaryFrom}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor={colors.textTertiary}
                editable={!isSummarizing}
              />
              <Text style={styles.summaryRangeLabel}>层到第</Text>
              <TextInput
                style={styles.summaryRangeInput}
                value={summaryTo}
                onChangeText={setSummaryTo}
                keyboardType="number-pad"
                placeholder="末"
                placeholderTextColor={colors.textTertiary}
                editable={!isSummarizing}
              />
              <Text style={styles.summaryRangeLabel}>层</Text>
            </View>

            <TextInput
              style={styles.summaryContentInput}
              value={summaryText}
              onChangeText={setSummaryText}
              multiline
              placeholder="总结内容将显示在这里..."
              placeholderTextColor={colors.textTertiary}
              editable={!isSummarizing}
            />

            <View style={styles.summaryFooter}>
              {isSummarizing && <ActivityIndicator color={colors.primary} />}
              {isSummarizing ? (
                <Pressable style={styles.summaryPrimaryButton} onPress={handleStopSummary}>
                  <Text style={styles.summaryPrimaryText}>停止</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.summaryPrimaryButton} onPress={handleSummarizeMessages}>
                  <Text style={styles.summaryPrimaryText}>总结</Text>
                </Pressable>
              )}
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={!!editingMessage} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setEditingMessage(null)}>
          <View style={styles.modal} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>编辑消息</Text>
            <TextInput
              style={styles.modalInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              placeholder="消息内容"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalDelete} onPress={handleDeleteMessage}>
                <Text style={styles.modalDeleteText}>删除</Text>
              </Pressable>
              <View style={styles.modalRightButtons}>
                <Pressable style={styles.modalCancel} onPress={() => setEditingMessage(null)}>
                  <Text style={styles.modalCancelText}>取消</Text>
                </Pressable>
                <Pressable style={styles.modalConfirm} onPress={handleSaveMessageEdit}>
                  <Text style={styles.modalConfirmText}>保存</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function buildSourceExcerpt(text: string, rawOffset: number, limit: number): string {
  const end = rawOffset > 0 ? rawOffset : Math.min(text.length, limit);
  const start = Math.max(0, end - Math.max(1, limit));
  return text.slice(start, end).trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isAbortError(error: any): boolean {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return name.includes('abort') || message.includes('abort') || message.includes('cancel');
}

function clampFrame(frame: PanelFrame): PanelFrame {
  const width = clamp(frame.width, PANEL_MIN_WIDTH, SCREEN_WIDTH - PANEL_MARGIN * 2);
  const height = clamp(frame.height, PANEL_MIN_HEIGHT, SCREEN_HEIGHT - HEADER_HEIGHT - PANEL_MARGIN * 2);
  return {
    width,
    height,
    x: clamp(frame.x, PANEL_MARGIN, SCREEN_WIDTH - width - PANEL_MARGIN),
    y: clamp(frame.y, HEADER_HEIGHT, SCREEN_HEIGHT - height - PANEL_MARGIN),
  };
}

function clampBallFrame(frame: PanelFrame): PanelFrame {
  return {
    ...frame,
    x: clamp(frame.x, PANEL_MARGIN, SCREEN_WIDTH - BALL_SIZE - PANEL_MARGIN),
    y: clamp(frame.y, HEADER_HEIGHT, SCREEN_HEIGHT - BALL_SIZE - PANEL_MARGIN),
  };
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 24,
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
  headerButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  backIcon: { fontSize: 28, color: colors.text, lineHeight: 30 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, maxWidth: '90%' },
  subtitle: { marginTop: 2, fontSize: 12, color: colors.textTertiary, maxWidth: '90%' },
  errorBanner: {
    backgroundColor: colors.dangerSurface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
  },
  errorText: { fontSize: 13, color: colors.danger },
  reader: { flex: 1 },
  readerContent: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 140,
  },
  bookHeading: {
    fontSize: 28,
    color: colors.text,
    fontFamily: fonts.serifBold,
    textAlign: 'center',
    marginBottom: 8,
  },
  bookSubheading: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: 28,
  },
  bodyText: {
    fontSize: 18,
    lineHeight: 31,
    color: colors.text,
    fontFamily: fonts.serif,
  },
  floatBall: {
    position: 'absolute',
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  floatBallIcon: { width: 32, height: 32 },
  chatPanel: {
    position: 'absolute',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  panelHeader: {
    height: 46,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
  },
  panelTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  panelSubtitle: { marginTop: 2, fontSize: 11, color: colors.textTertiary },
  panelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryButton: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  summaryButtonDisabled: { opacity: 0.45 },
  summaryButtonText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  collapseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  collapseButtonText: { fontSize: 20, color: colors.textSecondary, lineHeight: 22 },
  messageList: { flex: 1 },
  messageListContent: { paddingVertical: 10, gap: 8 },
  chatEmpty: {
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingTop: 24,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
  },
  userMessageRow: { justifyContent: 'flex-end' },
  assistantMessageRow: { justifyContent: 'flex-start' },
  messageFloorLeft: {
    marginRight: 6,
    marginBottom: 5,
    fontSize: 11,
    color: colors.primary,
    fontFamily: fonts.mono,
  },
  messageFloorRight: {
    marginLeft: 6,
    marginBottom: 5,
    fontSize: 11,
    color: colors.primary,
    fontFamily: fonts.mono,
  },
  messageBubble: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '86%',
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primaryLight },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  messageText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  chatInput: {
    flex: 1,
    height: 42,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
  },
  aiButton: {
    width: 50,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
  aiButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  resizeHandle: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeHandleText: { fontSize: 22, color: colors.textTertiary },
  emptyText: { fontSize: 15, color: colors.textTertiary, marginBottom: 16 },
  backButtonPill: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  backButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    width: '86%',
    maxHeight: '70%',
  },
  summaryModal: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 18,
    width: '88%',
    maxHeight: '78%',
  },
  summaryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  summaryHint: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textTertiary,
  },
  summaryCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  summaryCloseText: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  summaryRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  summaryRangeLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  summaryRangeInput: {
    width: 54,
    height: 38,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  summaryContentInput: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    padding: 12,
    minHeight: 180,
    maxHeight: 300,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  summaryFooter: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  summaryPrimaryButton: {
    minWidth: 74,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  summaryPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 },
  modalInput: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    padding: 12,
    minHeight: 140,
    textAlignVertical: 'top',
    fontSize: 14,
    color: colors.text,
  },
  modalButtons: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalRightButtons: { flexDirection: 'row', gap: 10 },
  modalDelete: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  modalDeleteText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  modalCancel: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  modalCancelText: { color: colors.textSecondary, fontSize: 15 },
  modalConfirm: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, backgroundColor: colors.primary },
  modalConfirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});

let styles = createStyles(colors);
