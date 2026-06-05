import { hotboardTool } from './toolModules/hotboard';
import { memoryVaultTool, uploadDiary } from './toolModules/memoryVault';
import { nativeDeviceTool } from './toolModules/nativeDevice';
import { shizukuFileTool } from './toolModules/shizukuFile';
import { webPageReaderTool } from './toolModules/webPageReader';
import { webSearchTool } from './toolModules/webSearch';
import { webViewTool } from './toolModules/webView';
import {
  ToolDefinition,
  ToolDefinitionConfig,
  ToolExecutionContext,
  ToolModule,
} from './toolModules/types';

export type { ToolDefinition, ToolDefinitionConfig, ToolExecutionContext, ToolModule };
export { uploadDiary };

const TOOL_MODULES: ToolModule[] = [
  memoryVaultTool,
  webSearchTool,
  webPageReaderTool,
  hotboardTool,
  webViewTool,
  nativeDeviceTool,
  shizukuFileTool,
];

export const TOOL_LABELS: Record<string, string> = TOOL_MODULES.reduce(
  (labels, toolModule) => ({ ...labels, ...toolModule.labels }),
  {}
);

export function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || toolName;
}

/**
 * 根据启用状态返回 tool 定义列表。
 */
export function getToolDefinitions(config: ToolDefinitionConfig): ToolDefinition[] {
  return TOOL_MODULES.flatMap((toolModule) => toolModule.getDefinitions(config));
}

/**
 * 执行指定工具并返回结果文本。
 */
export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  context: ToolExecutionContext
): Promise<string> {
  try {
    for (const toolModule of TOOL_MODULES) {
      const result = await toolModule.execute(toolName, args, context);
      if (result !== undefined) {
        return result;
      }
    }
    return `未知工具: ${toolName}`;
  } catch (err: any) {
    return `工具执行失败: ${err.message || '未知错误'}`;
  }
}
