import { getBotChannelMessages } from '../../db/operations';
import {
  pollWechatClawBotOnce,
  sendQqBotMessage,
  sendWechatClawBotMessage,
} from '../localBotChannels';
import { ToolDefinition, ToolModule } from './types';

function readTool(name: string, platform: string): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description: `读取 YSClaude 本地保存的最近 ${platform} Bot 消息。消息数可自定义；只能读取 YSClaude 运行期间收发的记录。`,
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'integer', description: '要读取的最近消息数。' },
        },
        required: [],
      },
    },
  };
}

function sendTool(name: string, platform: string): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description: `通过本机运行的 ${platform} Bot 向唯一绑定账号发送一条文本消息。仅在用户明确要求发送时调用。`,
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '要发送的完整文本。' },
        },
        required: ['message'],
      },
    },
  };
}

const QQ_READ = readTool('qq_bot_read_messages', 'QQ');
const QQ_SEND = sendTool('qq_bot_send_message', 'QQ');
const WECHAT_READ = readTool('wechat_clawbot_read_messages', '微信 ClawBot');
const WECHAT_SEND = sendTool('wechat_clawbot_send_message', '微信 ClawBot');

function formatMessages(messages: Awaited<ReturnType<typeof getBotChannelMessages>>): string {
  if (messages.length === 0) return '本地暂无消息记录。请先让绑定账号向 Bot 发送消息，并保持 YSClaude 运行。';
  return messages.map((message) => {
    const time = new Date(message.createdAt).toLocaleString();
    const direction = message.direction === 'incoming' ? '绑定账号 → Bot' : 'Bot → 绑定账号';
    return `[${time}] ${direction}\n${message.content}`;
  }).join('\n\n');
}

export const botMessagingTool: ToolModule = {
  id: 'bot-messaging',
  labels: {
    qq_bot_read_messages: '读取 QQ Bot 消息',
    qq_bot_send_message: '发送 QQ Bot 消息',
    wechat_clawbot_read_messages: '读取微信 ClawBot 消息',
    wechat_clawbot_send_message: '发送微信 ClawBot 消息',
  },
  getDefinitions: (config) => [
    ...(config.qqBotTools ? [QQ_READ, QQ_SEND] : []),
    ...(config.wechatClawBotTools ? [WECHAT_READ, WECHAT_SEND] : []),
  ],
  execute: async (toolName, args, context) => {
    if (toolName === 'qq_bot_read_messages') {
      const config = context.qqBotToolConfig;
      if (!config?.enabled) throw new Error('QQ Bot 工具未启用');
      const count = Math.min(config.maxReadLimit, Math.max(1, Number(args.count) || config.defaultReadLimit));
      return formatMessages(await getBotChannelMessages('qq', count));
    }
    if (toolName === 'qq_bot_send_message') {
      if (!context.qqBotToolConfig?.enabled) throw new Error('QQ Bot 工具未启用');
      const message = String(args.message || '').trim();
      if (!message) throw new Error('发送内容不能为空');
      await sendQqBotMessage(message, context.qqBotToolConfig);
      return 'QQ Bot 消息已发送。';
    }
    if (toolName === 'wechat_clawbot_read_messages') {
      const config = context.wechatClawBotToolConfig;
      if (!config?.enabled) throw new Error('微信 ClawBot 工具未启用');
      await pollWechatClawBotOnce(config).catch(() => 0);
      const count = Math.min(config.maxReadLimit, Math.max(1, Number(args.count) || config.defaultReadLimit));
      return formatMessages(await getBotChannelMessages('wechat', count));
    }
    if (toolName === 'wechat_clawbot_send_message') {
      if (!context.wechatClawBotToolConfig?.enabled) throw new Error('微信 ClawBot 工具未启用');
      const message = String(args.message || '').trim();
      if (!message) throw new Error('发送内容不能为空');
      await sendWechatClawBotMessage(message, context.wechatClawBotToolConfig);
      return '微信 ClawBot 消息已发送。';
    }
    return undefined;
  },
};
