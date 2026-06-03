import { WebInteractionConfig } from '../../stores/settings';
import {
  clickWebViewElement,
  clickWebViewSelector,
  observeWebView,
  openWebView,
  tapWebView,
  waitWebView,
} from '../webviewController';
import { normalizeWhitespace, truncateText, validateWebPageUrl } from './shared';
import { ToolDefinition, ToolModule } from './types';

const WEBVIEW_OPEN_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'webview_open',
    description:
      '在用户端打开一个可见网页面板，并返回打开后的页面观察结果。用于查看网页或进行简单前端小游戏交互。可根据对话需要自主打开 http/https 网页；如果页面已经打开，优先继续观察而不是重复打开。',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要打开的网页 URL，必须是 http 或 https 链接',
        },
        userAgent: {
          type: 'string',
          enum: ['mobile', 'desktop'],
          description:
            '打开网页时使用的 UA。mobile 使用默认移动端 UA；desktop 使用桌面端 UA。遇到移动端内容不完整、引导下载 App 或需要查看完整网页内容时优先选择 desktop。',
        },
      },
      required: ['url'],
    },
  },
};

const WEBVIEW_OBSERVE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'webview_observe',
    description:
      '观察当前用户端网页面板，返回页面标题、URL、可见文本、视口尺寸和可交互元素坐标。每次点击或等待后可再次调用。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

const WEBVIEW_TAP_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'webview_tap',
    description:
      '在当前用户端网页面板中点击指定坐标。坐标来自 webview_observe 返回的视口坐标，单位为网页 CSS 像素。',
    parameters: {
      type: 'object',
      properties: {
        x: {
          type: 'number',
          description: '点击位置的 x 坐标',
        },
        y: {
          type: 'number',
          description: '点击位置的 y 坐标',
        },
      },
      required: ['x', 'y'],
    },
  },
};

const WEBVIEW_CLICK_ELEMENT_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'webview_click_element',
    description:
      '点击 webview_observe 返回的可交互元素编号。普通按钮、链接、输入控件优先使用此工具，比坐标点击更稳定。',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'number',
          description: 'webview_observe 返回的元素 index',
        },
      },
      required: ['index'],
    },
  },
};

const WEBVIEW_CLICK_SELECTOR_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'webview_click_selector',
    description:
      '通过 CSS selector 查找元素并点击。仅在 webview_click_element 不适用或你明确知道 selector 时使用。',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector，例如 #start 或 button:nth-of-type(1)',
        },
      },
      required: ['selector'],
    },
  },
};

const WEBVIEW_WAIT_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'webview_wait',
    description:
      '等待网页发生加载、动画或游戏状态变化，然后返回新的网页观察结果。',
    parameters: {
      type: 'object',
      properties: {
        ms: {
          type: 'number',
          description: '等待毫秒数，范围 200 到 10000',
        },
      },
      required: ['ms'],
    },
  },
};

const WEBVIEW_TOOLS = [
  WEBVIEW_OPEN_TOOL,
  WEBVIEW_OBSERVE_TOOL,
  WEBVIEW_CLICK_ELEMENT_TOOL,
  WEBVIEW_CLICK_SELECTOR_TOOL,
  WEBVIEW_TAP_TOOL,
  WEBVIEW_WAIT_TOOL,
];

export const webViewTool: ToolModule = {
  id: 'web-view',
  labels: {
    webview_open: '打开网页',
    webview_observe: '观察网页',
    webview_tap: '点击网页',
    webview_click_element: '点击元素',
    webview_click_selector: '点击选择器',
    webview_wait: '等待网页',
  },
  getDefinitions: (config) => (config.webInteraction ? WEBVIEW_TOOLS : []),
  execute: async (toolName, args, context) => {
    switch (toolName) {
      case 'webview_open':
        return await executeWebViewOpen(
          args.url,
          args.userAgent,
          context.webInteractionConfig,
          !!context.webCruiseEnabled
        );
      case 'webview_observe':
        return await executeWebViewObserve(context.webInteractionConfig);
      case 'webview_tap':
        return await executeWebViewTap(args.x, args.y, context.webInteractionConfig);
      case 'webview_click_element':
        return await executeWebViewClickElement(args.index, context.webInteractionConfig);
      case 'webview_click_selector':
        return await executeWebViewClickSelector(args.selector, context.webInteractionConfig);
      case 'webview_wait':
        return await executeWebViewWait(args.ms, context.webInteractionConfig);
      default:
        return undefined;
    }
  },
};

async function executeWebViewOpen(
  rawUrl: unknown,
  rawUserAgent: unknown,
  config: WebInteractionConfig,
  defaultDesktopUserAgent = false
): Promise<string> {
  ensureWebInteractionEnabled(config);
  const url = validateWebPageUrl(rawUrl);
  const userAgent = normalizeWebViewUserAgent(rawUserAgent, defaultDesktopUserAgent);
  const observation = await openWebView(
    url,
    userAgent === 'desktop' ? { userAgent: 'desktop' } : { userAgent: 'mobile' }
  );
  return [
    `已在用户端打开网页：${observation.url || url}`,
    `UA: ${userAgent === 'desktop' ? '桌面端' : '移动端'}`,
    '',
    formatWebViewObservation(observation),
    '',
    '如果用户要求继续操作，请根据可交互元素坐标继续调用 webview_tap 或 webview_wait，不要把打开网页本身当作任务完成。',
  ].join('\n');
}

async function executeWebViewObserve(config: WebInteractionConfig): Promise<string> {
  ensureWebInteractionEnabled(config);
  const observation = await observeWebView();
  return formatWebViewObservation(observation);
}

async function executeWebViewTap(
  rawX: unknown,
  rawY: unknown,
  config: WebInteractionConfig
): Promise<string> {
  ensureWebInteractionEnabled(config);
  const x = normalizeCoordinate(rawX, 'x');
  const y = normalizeCoordinate(rawY, 'y');
  const result = await tapWebView(x, y);
  return [
    `已点击网页坐标 (${Math.round(result.x)}, ${Math.round(result.y)})`,
    `目标: ${result.target || '未知元素'}`,
    result.text ? `文本: ${result.text}` : '',
    '请调用 webview_observe 或 webview_wait 查看页面变化。',
  ].filter(Boolean).join('\n');
}

async function executeWebViewClickElement(
  rawIndex: unknown,
  config: WebInteractionConfig
): Promise<string> {
  ensureWebInteractionEnabled(config);
  const index = normalizeElementIndex(rawIndex);
  const result = await clickWebViewElement(index);
  return formatWebViewClickResult(result, `已点击网页元素 ${index}`);
}

async function executeWebViewClickSelector(
  rawSelector: unknown,
  config: WebInteractionConfig
): Promise<string> {
  ensureWebInteractionEnabled(config);
  if (typeof rawSelector !== 'string' || !rawSelector.trim()) {
    throw new Error('缺少有效的 CSS selector');
  }
  const result = await clickWebViewSelector(rawSelector.trim());
  return formatWebViewClickResult(result, `已点击选择器 ${rawSelector.trim()}`);
}

async function executeWebViewWait(
  rawMs: unknown,
  config: WebInteractionConfig
): Promise<string> {
  ensureWebInteractionEnabled(config);
  const ms = normalizeWaitMs(rawMs);
  const observation = await waitWebView(ms);
  return formatWebViewObservation(observation);
}

function ensureWebInteractionEnabled(config: WebInteractionConfig): void {
  if (!config?.enabled) {
    throw new Error('网页交互未启用，请先在「Tool 设置」中打开');
  }
}

function normalizeCoordinate(raw: unknown, name: string): number {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(value)) {
    throw new Error(`缺少有效的 ${name} 坐标`);
  }
  return value;
}

function normalizeWaitMs(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : 1000;
  if (!Number.isFinite(value)) return 1000;
  return Math.min(Math.max(Math.floor(value), 200), 10000);
}

function normalizeWebViewUserAgent(raw: unknown, defaultDesktopUserAgent: boolean): 'mobile' | 'desktop' {
  if (raw === undefined || raw === null || raw === '') {
    return defaultDesktopUserAgent ? 'desktop' : 'mobile';
  }
  if (typeof raw !== 'string') {
    throw new Error('缺少有效的 UA 类型，请使用 mobile 或 desktop');
  }
  const value = raw.trim().toLowerCase();
  if (value === 'mobile') return 'mobile';
  if (value === 'desktop') return 'desktop';
  throw new Error('UA 类型只支持 mobile 或 desktop');
}

function normalizeElementIndex(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('缺少有效的元素 index');
  }
  return value;
}

function formatWebViewClickResult(result: Awaited<ReturnType<typeof clickWebViewElement>>, title: string): string {
  return [
    title,
    `坐标: (${Math.round(result.x)}, ${Math.round(result.y)})`,
    `目标: ${result.target || '未知元素'}`,
    result.selector ? `Selector: ${result.selector}` : '',
    result.text ? `文本: ${result.text}` : '',
    '请调用 webview_observe 或 webview_wait 查看页面变化。',
  ].filter(Boolean).join('\n');
}

export function formatWebViewObservation(observation: Awaited<ReturnType<typeof observeWebView>>): string {
  const lines = [
    `网页标题: ${observation.title || '无标题'}`,
    `URL: ${observation.url}`,
    `视口: ${observation.viewport.width} x ${observation.viewport.height}`,
  ];

  const text = normalizeWhitespace(observation.text || '');
  if (text) {
    lines.push('', `可见文本:\n${truncateText(text, 4000)}`);
  }

  if (observation.elements.length > 0) {
    lines.push('', '可交互元素:');
    for (const el of observation.elements.slice(0, 20)) {
      const label = el.text || el.role || el.tag || '元素';
      lines.push(
        `${el.index}. ${label} [${el.tag}] selector=${el.selector || '无'} x=${el.x}, y=${el.y}, w=${el.width}, h=${el.height}`
      );
    }
  }

  lines.push('\n如需点击普通 DOM 元素，请优先调用 webview_click_element；只有 canvas 或没有合适元素时再使用 webview_tap。');
  return lines.join('\n');
}
