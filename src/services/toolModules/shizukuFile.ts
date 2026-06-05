import {
  listShizukuDirectory,
  listShizukuRoots,
  readShizukuFile,
} from '../shizukuFiles';
import { ToolDefinition, ToolModule } from './types';

const SHIZUKU_LIST_ROOTS_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'shizuku_file_list_roots',
    description:
      '列出用户手动授权给 Shizuku 文件访问的只读路径根。后续 Shizuku 文件工具必须使用这些 root_id，并只能访问根内相对路径。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
};

const SHIZUKU_LIST_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'shizuku_file_list',
    description:
      '通过 Shizuku 只读列出授权路径根内的目录。path 必须是授权根内的相对路径，不能使用绝对路径或 ..。',
    parameters: {
      type: 'object',
      properties: {
        root_id: { type: 'string', description: '授权路径根 ID，可从 shizuku_file_list_roots 获取；省略时使用默认根' },
        path: { type: 'string', description: '授权根内的相对目录路径；省略或空字符串表示根目录' },
      },
      required: [],
    },
  },
};

const SHIZUKU_READ_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'shizuku_file_read',
    description:
      '通过 Shizuku 只读读取授权路径根内的文件内容。path 必须是授权根内的相对文件路径，不能使用绝对路径或 ..。',
    parameters: {
      type: 'object',
      properties: {
        root_id: { type: 'string', description: '授权路径根 ID，可从 shizuku_file_list_roots 获取；省略时使用默认根' },
        path: { type: 'string', description: '授权根内的相对文件路径' },
        max_bytes: { type: 'number', description: '最多读取多少字节，可选，默认 65536，最大 1048576' },
      },
      required: ['path'],
    },
  },
};

export const shizukuFileTool: ToolModule = {
  id: 'shizuku-file',
  labels: {
    shizuku_file_list_roots: '查看 Shizuku 路径',
    shizuku_file_list: '列出 Shizuku 目录',
    shizuku_file_read: '读取 Shizuku 文件',
  },
  getDefinitions: (config) =>
    config.shizukuFile?.enabled
      ? [SHIZUKU_LIST_ROOTS_TOOL, SHIZUKU_LIST_TOOL, SHIZUKU_READ_TOOL]
      : [],
  execute: async (toolName, args, context) => {
    switch (toolName) {
      case 'shizuku_file_list_roots':
        return listShizukuRoots(context.shizukuFileConfig);
      case 'shizuku_file_list':
        return await listShizukuDirectory(args, context.shizukuFileConfig);
      case 'shizuku_file_read':
        return await readShizukuFile(args, context.shizukuFileConfig);
      default:
        return undefined;
    }
  },
};
