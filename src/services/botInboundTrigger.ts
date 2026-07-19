import { randomUUID } from 'expo-crypto';
import { createConversation, getAllConversations } from '../db/operations';
import { useChatStore } from '../stores/chat';
import { useSettingsStore } from '../stores/settings';
import { Conversation } from '../types';

let inboundQueue: Promise<unknown> = Promise.resolve();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChatIdle(): Promise<void> {
  while (useChatStore.getState().isStreaming) await delay(400);
}

async function ensureConversation(): Promise<Conversation> {
  const latest = (await getAllConversations())[0];
  if (latest) return latest;
  const settings = useSettingsStore.getState();
  const api = settings.apiConfigs[settings.activeConfigIndex];
  const now = Date.now();
  const conversation: Conversation = {
    id: randomUUID(),
    title: 'Bot 消息',
    systemPrompt: settings.systemPrompt,
    model: api?.model || '',
    createdAt: now,
    updatedAt: now,
  };
  await createConversation(conversation);
  return conversation;
}

async function triggerNow(platform: 'qq' | 'wechat', content: string): Promise<void> {
  await waitForChatIdle();
  const conversation = await ensureConversation();
  const chat = useChatStore.getState();
  if (chat.conversationId !== conversation.id) await chat.loadConversation(conversation.id);

  const platformName = platform === 'qq' ? 'QQ Bot' : '微信 ClawBot';
  const toolName = platform === 'qq' ? 'qq_bot_send_message' : 'wechat_clawbot_send_message';
  const message = await useChatStore.getState().addUserMessage(content);
  if (!message) return;
  await useChatStore.getState().triggerResponse({
    additionalRuntimeSections: [
      `这是一次性平台事件：用户刚刚从 ${platformName} 发来一条新消息。请正常理解并回复该消息；如果需要向用户作出回复，必须调用 ${toolName} 工具把回复发送回 ${platformName}。不要把本段事件提示视为用户消息，也不要在后续轮次延续本提示。`,
    ],
  });
}

export function triggerBotInboundMessage(platform: 'qq' | 'wechat', content: string): Promise<void> {
  const next = inboundQueue.catch(() => undefined).then(() => triggerNow(platform, content));
  inboundQueue = next.catch(() => undefined);
  return next;
}
