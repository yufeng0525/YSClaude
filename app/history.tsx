import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Alert, TextInput, Modal, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { lightColors, useThemeColors, type ThemeColors } from '../src/theme/colors';

import { fonts } from '../src/theme/fonts';
import { Conversation } from '../src/types';
import {
  getAllConversations,
  deleteConversation,
  updateConversation,
  searchMessages,
  ChatSearchResult,
} from '../src/db/operations';
import { useChatStore } from '../src/stores/chat';


let colors = lightColors;
type SearchScope = 'current' | 'global';

export default function HistoryScreen() {
  colors = useThemeColors();
  styles = useMemo(() => createStyles(colors), [colors]);

  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [editingConv, setEditingConv] = useState<Conversation | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('current');
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const { conversationId, loadConversation, loadConversationAroundMessage, newConversation } = useChatStore();
  const isSearchActive = searchText.trim().length > 0;

  useFocusEffect(
    useCallback(() => {
      loadList();
    }, [])
  );

  async function loadList() {
    const list = await getAllConversations();
    setConversations(list);
  }

  useEffect(() => {
    const keyword = searchText.trim();
    if (!keyword) {
      setSearchResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      if (searchScope === 'current' && !conversationId) {
        setSearchResults([]);
        setSearchError('请先打开一个对话，或切换到全局搜索');
        setSearching(false);
        return;
      }

      setSearching(true);
      setSearchError(null);
      try {
        const results = await searchMessages(keyword, {
          conversationId: searchScope === 'current' ? conversationId || undefined : undefined,
          limit: 80,
        });
        setSearchResults(results);
      } catch (error: any) {
        setSearchResults([]);
        setSearchError(error?.message || '搜索失败');
      } finally {
        setSearching(false);
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [conversationId, searchScope, searchText]);

  function handleOpen(conv: Conversation) {
    loadConversation(conv.id);
    router.back();
  }

  async function handleOpenSearchResult(result: ChatSearchResult) {
    await loadConversationAroundMessage(result.conversationId, result.messageId);
    router.back();
  }

  function handleLongPress(conv: Conversation) {
    setEditingConv(conv);
    setEditTitle(conv.title);
  }

  async function handleSaveTitle() {
    if (!editingConv) return;
    await updateConversation(editingConv.id, { title: editTitle.trim(), updatedAt: Date.now() });
    setEditingConv(null);
    loadList();
  }

  function handleDelete(conv: Conversation) {
    Alert.alert('删除对话', `确定删除「${conv.title || '无标题'}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteConversation(conv.id);
          loadList();
        },
      },
    ]);
  }

  function handleNewChat() {
    newConversation();
    router.back();
  }

  function formatTime(ts: number) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function roleLabel(role: ChatSearchResult['role']) {
    if (role === 'user') return '你';
    if (role === 'assistant') return 'AI';
    if (role === 'system') return '系统';
    return role;
  }

  function snippet(text: string) {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > 90 ? `${clean.slice(0, 90)}…` : clean;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.title}>对话历史</Text>
        <Pressable style={styles.newButton} onPress={handleNewChat}>
          <Text style={styles.newIcon}>✎</Text>
        </Pressable>
      </View>

      <View style={styles.searchPanel}>
        <View style={styles.searchInputRow}>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="搜索聊天记录"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
          />
          {searching && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
        <View style={styles.searchScopeRow}>
          <Pressable
            style={[styles.scopeButton, searchScope === 'current' && styles.scopeButtonActive]}
            onPress={() => setSearchScope('current')}
          >
            <Text style={[styles.scopeButtonText, searchScope === 'current' && styles.scopeButtonTextActive]}>
              当前窗口
            </Text>
          </Pressable>
          <Pressable
            style={[styles.scopeButton, searchScope === 'global' && styles.scopeButtonActive]}
            onPress={() => setSearchScope('global')}
          >
            <Text style={[styles.scopeButtonText, searchScope === 'global' && styles.scopeButtonTextActive]}>
              全局搜索
            </Text>
          </Pressable>
        </View>
      </View>

      {isSearchActive ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.messageId}
          renderItem={({ item }) => (
            <Pressable style={styles.searchResultItem} onPress={() => handleOpenSearchResult(item)}>
              <View style={styles.searchResultHeader}>
                <Text style={styles.searchResultTitle} numberOfLines={1}>
                  {item.conversationTitle || '新对话'}
                </Text>
                <Text style={styles.searchResultTime}>{formatTime(item.createdAt)}</Text>
              </View>
              <Text style={styles.searchResultMeta}>{roleLabel(item.role)}</Text>
              <Text style={styles.searchResultSnippet} numberOfLines={2}>
                {snippet(item.content) || '（空消息）'}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {searchError || (searching ? '正在搜索...' : '没有搜索结果')}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isActive = item.id === conversationId;
            return (
              <Pressable
                style={[styles.item, isActive && styles.itemActive]}
                onPress={() => handleOpen(item)}
                onLongPress={() => handleLongPress(item)}
              >
                <View style={styles.itemContent}>
                  <Text
                    style={[styles.itemTitle, isActive && styles.itemTitleActive]}
                    numberOfLines={1}
                  >
                    {item.title || '新对话'}
                  </Text>
                  <Text style={[styles.itemMeta, isActive && styles.itemMetaActive]}>
                    {item.model} · {formatTime(item.createdAt)}
                  </Text>
                </View>
                <Pressable style={styles.deleteButton} onPress={() => handleDelete(item)}>
                  <Text style={[styles.deleteIcon, isActive && styles.deleteIconActive]}>×</Text>
                </Pressable>
              </Pressable>
            );
          }}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>暂无历史对话</Text>
            </View>
          }
        />
      )}

      {/* Edit title modal */}
      <Modal visible={!!editingConv} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setEditingConv(null)}>
          <View style={styles.modal} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>编辑标题</Text>
            <TextInput
              style={styles.modalInput}
              value={editTitle}
              onChangeText={setEditTitle}
              autoFocus
              selectTextOnFocus
              placeholder="输入对话标题"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalCancel} onPress={() => setEditingConv(null)}>
                <Text style={styles.modalCancelText}>取消</Text>
              </Pressable>
              <Pressable style={styles.modalConfirm} onPress={handleSaveTitle}>
                <Text style={styles.modalConfirmText}>保存</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  backIcon: { fontSize: 22, color: colors.text },
  title: { flex: 1, fontSize: 18, fontWeight: '600', color: colors.text, textAlign: 'center' },
  newButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  newIcon: { fontSize: 20, color: colors.text },
  searchPanel: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  searchInputRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 9,
  },
  searchScopeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  scopeButton: {
    minHeight: 32,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scopeButtonActive: {
    backgroundColor: colors.primary,
  },
  scopeButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  scopeButtonTextActive: {
    color: '#FFFFFF',
  },
  list: { paddingVertical: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 12,
    paddingVertical: 14,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  itemActive: {
    backgroundColor: colors.surface,
    borderLeftColor: colors.primary,
  },
  itemContent: { flex: 1, gap: 4 },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  itemTitleActive: {
    color: colors.text,
    fontWeight: '700',
  },
  itemMeta: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  itemMetaActive: {
    color: colors.primary,
  },
  searchResultItem: {
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  searchResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  searchResultTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  searchResultTime: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  searchResultMeta: {
    fontSize: 12,
    color: colors.primary,
    marginBottom: 5,
  },
  searchResultSnippet: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  deleteButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  deleteIcon: {
    fontSize: 20,
    color: colors.textTertiary,
  },
  deleteIconActive: {
    color: colors.primary,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 120 },
  emptyText: { fontSize: 15, color: colors.textTertiary },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 24,
    width: '80%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalCancelText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  modalConfirm: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  modalConfirmText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});

let styles = createStyles(colors);
