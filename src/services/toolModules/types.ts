import {
  HotboardConfig,
  MemoryVaultConfig,
  NativeToolConfig,
  PhoneFileAgentConfig,
  ShizukuFileConfig,
  WebInteractionConfig,
  WebPageReaderConfig,
  WebSearchConfig,
} from '../../stores/settings';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export interface ToolDefinitionConfig {
  memoryVault: boolean;
  webSearch: boolean;
  webPageReader?: boolean;
  webInteraction?: boolean;
  hotboard?: boolean;
  nativeTools?: NativeToolConfig;
  phoneFileAgent?: PhoneFileAgentConfig;
  shizukuFile?: ShizukuFileConfig;
}

export interface ToolExecutionContext {
  memoryVaultConfig: MemoryVaultConfig;
  webSearchConfig: WebSearchConfig;
  webPageReaderConfig: WebPageReaderConfig;
  webInteractionConfig: WebInteractionConfig;
  hotboardConfig: HotboardConfig;
  nativeToolConfig: NativeToolConfig;
  phoneFileAgentConfig: PhoneFileAgentConfig;
  shizukuFileConfig: ShizukuFileConfig;
  webCruiseEnabled?: boolean;
}

export interface ToolModule {
  id: string;
  labels: Record<string, string>;
  getDefinitions: (config: ToolDefinitionConfig) => ToolDefinition[];
  execute: (
    toolName: string,
    args: Record<string, any>,
    context: ToolExecutionContext
  ) => Promise<string | undefined>;
}
