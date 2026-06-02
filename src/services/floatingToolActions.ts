import { router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useChatStore } from '../stores/chat';
import { useSettingsStore } from '../stores/settings';
import { Conversation, Message } from '../types';
import { createConversation, getAllConversations } from '../db/operations';
import {
  captureFloatingBallScreen,
  FloatingBallToolAction,
  openYSClaudeFromFloatingBall,
  showFloatingBallMessage,
} from './floatingBall';

let actionBusy = false;

async function getLatestCreatedConversation(): Promise<Conversation | null> {
  const conversations = await getAllConversations();
  return conversations[0] ?? null;
}

async function ensureLatestCreatedConversationLoaded(): Promise<void> {
  const latest = await getLatestCreatedConversation();
  if (latest) {
    const state = useChatStore.getState();
    if (state.conversationId !== latest.id) {
      await state.loadConversation(latest.id);
    }
    return;
  }

  const settings = useSettingsStore.getState();
  const config = settings.apiConfigs[settings.activeConfigIndex];
  const now = Date.now();
  const conversation: Conversation = {
    id: randomUUID(),
    title: '新对话',
    systemPrompt: settings.systemPrompt,
    model: config?.model || '',
    createdAt: now,
    updatedAt: now,
  };
  await createConversation(conversation);
  await useChatStore.getState().loadConversation(conversation.id);
}

async function insertUserMessage(content: string, imageUri?: string): Promise<Message | null> {
  await ensureLatestCreatedConversationLoaded();
  const beforeIds = new Set(useChatStore.getState().messages.map((message) => message.id));
  await useChatStore.getState().addUserMessage(content, imageUri);
  return (
    useChatStore
      .getState()
      .messages
      .find((message) => !beforeIds.has(message.id) && message.role === 'user') ?? null
  );
}

async function handleScreenShare(): Promise<void> {
  const imageUri = await captureFloatingBallScreen();
  if (!imageUri) return;
  const message = await insertUserMessage('屏幕共享', imageUri);
  if (message) {
    useChatStore.getState().markMessagesForAutoHideAfterResponse([message.id]);
  }
  showFloatingBallMessage('已把当前屏幕发送到最新聊天', { speak: false }).catch(() => {});
}

async function handleTextInput(text?: string): Promise<void> {
  const content = text?.trim();
  if (!content) return;
  await insertUserMessage(content);
  showFloatingBallMessage(content, { speak: false }).catch(() => {});
}

async function handleGetReply(): Promise<void> {
  await ensureLatestCreatedConversationLoaded();
  await useChatStore.getState().triggerResponse();
}

async function handleOpenApp(): Promise<void> {
  await openYSClaudeFromFloatingBall();
  router.replace('/');
}

export async function handleFloatingBallToolAction(action: FloatingBallToolAction): Promise<void> {
  const actionName = typeof action === 'string' ? action : action.action;
  if (actionBusy && actionName !== 'open_app') return;
  actionBusy = true;
  try {
    switch (actionName) {
      case 'screen_share':
        await handleScreenShare();
        break;
      case 'text_input':
        await handleTextInput(typeof action === 'string' ? undefined : action.text);
        break;
      case 'get_reply':
        await handleGetReply();
        break;
      case 'open_app':
        await handleOpenApp();
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '悬浮球工具执行失败';
    showFloatingBallMessage(message, { speak: false }).catch(() => {});
  } finally {
    actionBusy = false;
  }
}
