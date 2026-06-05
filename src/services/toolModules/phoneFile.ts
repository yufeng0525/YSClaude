import {
  listPhoneDirectory,
  listPhoneFileRoots,
  readPhoneFile,
  searchPhoneFiles,
} from '../phoneFileAgent';
import { ToolDefinition, ToolModule } from './types';

const PHONE_FILE_LIST_ROOTS_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'phone_file_list_roots',
    description:
      '列出用户已授权给手机文件 Agent 的只读根。根可能是应用内部目录，也可能是用户从其他 App 选择授权的单个文件。所有后续文件工具都必须使用这里返回的 rootId，若省略 root_id 则使用第一个根。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
};

const PHONE_FILE_LIST_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'phone_file_list',
    description:
      '只读列出授权根内的文件和子目录。path 必须是授权根内的相对路径，不能使用绝对路径或 ..。',
    parameters: {
      type: 'object',
      properties: {
        root_id: { type: 'string', description: '授权根 ID，可从 phone_file_list_roots 获取；省略时使用默认根' },
        path: { type: 'string', description: '授权根内的相对目录路径；省略或空字符串表示根目录。若根是单个文件，只能省略 path。' },
        limit: { type: 'number', description: '最多返回多少项，可选，默认 80，最大 200' },
      },
      required: [],
    },
  },
};

const PHONE_FILE_READ_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'phone_file_read',
    description:
      '只读读取授权根内的文本文件内容。path 必须是授权根内的相对文件路径；若根是单个文件，可以省略 path。不要读取明显的二进制、大文件或无关隐私文件。',
    parameters: {
      type: 'object',
      properties: {
        root_id: { type: 'string', description: '授权根 ID，可从 phone_file_list_roots 获取；省略时使用默认根' },
        path: { type: 'string', description: '授权根内的相对文件路径；若根是单个文件，可以省略' },
        max_chars: { type: 'number', description: '最多返回多少字符，可选，默认 12000，最大 30000' },
      },
      required: [],
    },
  },
};

const PHONE_FILE_SEARCH_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'phone_file_search',
    description:
      '在授权根内只读搜索文件名，并对常见小型文本文件搜索内容。path 必须是相对目录路径；搜索会限制深度、文件数量和返回条数。',
    parameters: {
      type: 'object',
      properties: {
        root_id: { type: 'string', description: '授权根 ID，可从 phone_file_list_roots 获取；省略时使用默认根' },
        path: { type: 'string', description: '搜索起点的相对目录路径；省略或空字符串表示根目录。若根是单个文件，可以省略。' },
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '最多返回多少条结果，可选，默认 20，最大 50' },
      },
      required: ['query'],
    },
  },
};

export const phoneFileTool: ToolModule = {
  id: 'phone-file',
  labels: {
    phone_file_list_roots: '查看授权目录',
    phone_file_list: '列出手机目录',
    phone_file_read: '读取手机文件',
    phone_file_search: '搜索手机文件',
  },
  getDefinitions: (config) =>
    config.phoneFileAgent?.enabled
      ? [
          PHONE_FILE_LIST_ROOTS_TOOL,
          PHONE_FILE_LIST_TOOL,
          PHONE_FILE_READ_TOOL,
          PHONE_FILE_SEARCH_TOOL,
        ]
      : [],
  execute: async (toolName, args, context) => {
    switch (toolName) {
      case 'phone_file_list_roots':
        return listPhoneFileRoots(context.phoneFileAgentConfig);
      case 'phone_file_list':
        return await listPhoneDirectory(args, context.phoneFileAgentConfig);
      case 'phone_file_read':
        return await readPhoneFile(args, context.phoneFileAgentConfig);
      case 'phone_file_search':
        return await searchPhoneFiles(args, context.phoneFileAgentConfig);
      default:
        return undefined;
    }
  },
};
