import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { PhoneFileAgentConfig, PhoneFileRoot } from '../stores/settings';
import { normalizeWhitespace, truncateText } from './toolModules/shared';

const APP_DOCUMENT_ROOT_ID = 'app_document';
const DEFAULT_LIST_LIMIT = 80;
const MAX_LIST_LIMIT = 200;
const DEFAULT_READ_CHAR_LIMIT = 12000;
const MAX_READ_CHAR_LIMIT = 30000;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
const SEARCH_MAX_DEPTH = 5;
const SEARCH_MAX_FILES = 240;
const SEARCH_TEXT_MAX_BYTES = 512 * 1024;
const SEARCH_TEXT_READ_CHARS = 8000;

const TEXT_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.conf',
  '.cpp',
  '.cs',
  '.css',
  '.csv',
  '.env',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.log',
  '.lua',
  '.md',
  '.mjs',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

type FsEntry = Directory | File;

interface ResolvedRoot {
  id: string;
  name: string;
  kind: 'app_document' | 'user_directory' | 'user_file';
  directory?: Directory;
  file?: File;
  size?: number;
  mimeType?: string;
}

interface ListedEntry {
  name: string;
  path: string;
  type: 'directory' | 'file';
  sizeBytes?: number | null;
  modificationTime?: number | null;
}

function toJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function ensureAndroid(): void {
  if (Platform.OS !== 'android') {
    throw new Error('手机文件 Agent 当前仅支持 Android');
  }
}

export function getAppDocumentPhoneFileRoot(): PhoneFileRoot {
  return {
    id: APP_DOCUMENT_ROOT_ID,
    name: '应用内部文档目录',
    uri: Paths.document.uri,
    addedAt: 0,
  };
}

export function getPhoneFileRootCount(config?: PhoneFileAgentConfig): number {
  if (!config) return 0;
  return (config.includeAppDocument ? 1 : 0) + config.roots.length;
}

function resolveRoots(config: PhoneFileAgentConfig): ResolvedRoot[] {
  const roots: ResolvedRoot[] = [];
  if (config.includeAppDocument) {
    roots.push({
      id: APP_DOCUMENT_ROOT_ID,
      name: '应用内部文档目录',
      kind: 'app_document',
      directory: Paths.document,
    });
  }

  for (const root of config.roots) {
    const kind = root.kind || (root.uri.startsWith('content://') ? 'file' : 'directory');
    if (kind === 'file') {
      roots.push({
        id: root.id,
        name: root.name || '用户选择文件',
        kind: 'user_file',
        file: new File(root.uri),
        size: root.size,
        mimeType: root.mimeType,
      });
      continue;
    }

    roots.push({
      id: root.id,
      name: root.name || '用户选择目录',
      kind: 'user_directory',
      directory: new Directory(root.uri),
    });
  }

  return roots;
}

function getRoot(config: PhoneFileAgentConfig, rootId?: unknown): ResolvedRoot {
  const roots = resolveRoots(config);
  if (roots.length === 0) {
    throw new Error('未授权任何可读目录，请先在 Tool 设置中选择目录');
  }
  if (typeof rootId !== 'string' || !rootId.trim()) {
    return roots[0];
  }

  const root = roots.find((item) => item.id === rootId.trim());
  if (!root) {
    throw new Error(`未找到授权目录: ${String(rootId)}`);
  }
  return root;
}

function normalizeRelativePath(rawPath: unknown): string {
  if (rawPath === undefined || rawPath === null || rawPath === '') return '';
  if (typeof rawPath !== 'string') {
    throw new Error('path 必须是字符串');
  }

  const value = rawPath.trim();
  if (!value) return '';
  if (value.includes('\0')) {
    throw new Error('path 不能包含空字符');
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('/')) {
    throw new Error('path 必须是授权目录内的相对路径');
  }

  const segments = value
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.');

  for (const segment of segments) {
    if (segment === '..') {
      throw new Error('path 不能跳出授权目录');
    }
    if (segment.length > 180) {
      throw new Error('path 片段过长');
    }
  }

  return segments.join('/');
}

function splitPath(relativePath: string): string[] {
  return relativePath ? relativePath.split('/') : [];
}

function isDirectory(entry: FsEntry): entry is Directory {
  return entry instanceof Directory;
}

function isFile(entry: FsEntry): entry is File {
  return entry instanceof File;
}

function joinRelativePath(basePath: string, name: string): string {
  return basePath ? `${basePath}/${name}` : name;
}

function clampNumber(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function safeInfo(entry: FsEntry): { size?: number | null; modificationTime?: number | null } {
  try {
    const info = entry.info();
    return {
      size: 'size' in info ? info.size ?? null : null,
      modificationTime: 'modificationTime' in info ? info.modificationTime ?? null : null,
    };
  } catch {
    return {};
  }
}

function entryToListItem(entry: FsEntry, basePath: string): ListedEntry {
  const info = safeInfo(entry);
  return {
    name: entry.name,
    path: joinRelativePath(basePath, entry.name),
    type: isDirectory(entry) ? 'directory' : 'file',
    sizeBytes: info.size,
    modificationTime: info.modificationTime,
  };
}

function getExtension(name: string): string {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : '';
}

function canSearchText(file: File): boolean {
  return canSearchTextByName(file, file.name);
}

function canSearchTextByName(file: File, name: string): boolean {
  const extension = getExtension(name);
  if (!TEXT_EXTENSIONS.has(extension)) return false;
  const info = safeInfo(file);
  return typeof info.size !== 'number' || info.size <= SEARCH_TEXT_MAX_BYTES;
}

function makeExcerpt(text: string, query: string): string {
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lower.indexOf(lowerQuery);
  if (index < 0) return '';

  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + query.length + 160);
  return normalizeWhitespace(text.slice(start, end));
}

async function resolveEntry(root: ResolvedRoot, rawPath: unknown): Promise<{ path: string; entry: FsEntry }> {
  const path = normalizeRelativePath(rawPath);
  if (root.file) {
    if (!path || path === root.name || path === root.file.name) {
      return { path, entry: root.file };
    }
    throw new Error('该授权根是单个文件，只能读取该文件本身');
  }
  if (!root.directory) {
    throw new Error('授权根不可读');
  }

  const segments = splitPath(path);
  if (segments.length === 0) {
    return { path, entry: root.directory };
  }

  let current: Directory = root.directory;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const entries = current.list();
    const entry = entries.find((item) => item.name === segment);
    if (!entry) {
      throw new Error(`路径不存在: ${segments.slice(0, index + 1).join('/')}`);
    }
    if (index === segments.length - 1) {
      return { path, entry };
    }
    if (!isDirectory(entry)) {
      throw new Error(`路径不是目录: ${segments.slice(0, index + 1).join('/')}`);
    }
    current = entry;
  }

  return { path, entry: current };
}

function assertEnabled(config: PhoneFileAgentConfig): void {
  ensureAndroid();
  if (!config.enabled) {
    throw new Error('手机文件 Agent 未启用，请先在 Tool 设置中打开');
  }
}

export function listPhoneFileRoots(config: PhoneFileAgentConfig): string {
  assertEnabled(config);
  const roots = resolveRoots(config);
  return toJson({
    access: 'read_only',
    roots: roots.map((root) => ({
      id: root.id,
      name: root.name,
      kind: root.kind,
      sizeBytes: root.size,
      mimeType: root.mimeType,
    })),
  });
}

export async function listPhoneDirectory(args: Record<string, any>, config: PhoneFileAgentConfig): Promise<string> {
  assertEnabled(config);
  const root = getRoot(config, args.root_id ?? args.rootId);
  if (root.file) {
    const path = normalizeRelativePath(args.path);
    if (path) {
      throw new Error('该授权根是单个文件，没有子目录可列出');
    }
    const info = safeInfo(root.file);
    return toJson({
      rootId: root.id,
      rootName: root.name,
      path: '',
      totalEntries: 1,
      returnedEntries: 1,
      entries: [{
        name: root.name,
        path: root.name,
        type: 'file',
        sizeBytes: root.size ?? info.size,
        modificationTime: info.modificationTime,
      }],
      truncated: false,
    });
  }

  const { path, entry } = await resolveEntry(root, args.path);
  if (!isDirectory(entry)) {
    throw new Error('path 指向的是文件，不能列目录');
  }

  const limit = clampNumber(args.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const entries = entry
    .list()
    .map((item) => entryToListItem(item, path))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return toJson({
    rootId: root.id,
    rootName: root.name,
    path,
    totalEntries: entries.length,
    returnedEntries: Math.min(entries.length, limit),
    entries: entries.slice(0, limit),
    truncated: entries.length > limit,
  });
}

export async function readPhoneFile(args: Record<string, any>, config: PhoneFileAgentConfig): Promise<string> {
  assertEnabled(config);
  const root = getRoot(config, args.root_id ?? args.rootId);
  const { path, entry } = await resolveEntry(root, args.path);
  if (!isFile(entry)) {
    throw new Error('path 指向的是目录，不能读取为文件');
  }

  const maxChars = clampNumber(args.max_chars ?? args.maxChars, DEFAULT_READ_CHAR_LIMIT, MAX_READ_CHAR_LIMIT);
  const info = safeInfo(entry);
  const text = await entry.text();
  const truncated = text.length > maxChars;

  return toJson({
    rootId: root.id,
    rootName: root.name,
    path: path || (root.file ? root.name : path),
    sizeBytes: info.size,
    modificationTime: info.modificationTime,
    content: truncateText(text, maxChars),
    truncated,
  });
}

export async function searchPhoneFiles(args: Record<string, any>, config: PhoneFileAgentConfig): Promise<string> {
  assertEnabled(config);
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) {
    throw new Error('缺少搜索关键词 query');
  }

  const root = getRoot(config, args.root_id ?? args.rootId);
  const limit = clampNumber(args.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
  if (root.file) {
    const path = normalizeRelativePath(args.path);
    if (path && path !== root.name && path !== root.file.name) {
      throw new Error('该授权根是单个文件，只能搜索该文件本身');
    }

    const results: Array<{
      path: string;
      type: 'directory' | 'file';
      match: 'name' | 'content';
      excerpt?: string;
    }> = [];
    if (root.name.toLowerCase().includes(query.toLowerCase())) {
      results.push({ path: root.name, type: 'file', match: 'name' });
    }
    if (canSearchTextByName(root.file, root.name)) {
      try {
        const text = await root.file.text();
        const excerpt = makeExcerpt(truncateText(text, SEARCH_TEXT_READ_CHARS), query);
        if (excerpt) {
          results.push({ path: root.name, type: 'file', match: 'content', excerpt });
        }
      } catch {
        // If the provider no longer grants read access, return name matches only.
      }
    }

    return toJson({
      rootId: root.id,
      rootName: root.name,
      path: '',
      query,
      results: results.slice(0, limit),
      scannedFiles: 1,
      scannedDirectories: 0,
      truncated: results.length > limit,
    });
  }

  const { path, entry } = await resolveEntry(root, args.path);
  if (!isDirectory(entry)) {
    throw new Error('搜索起点必须是目录');
  }

  const results: Array<{
    path: string;
    type: 'directory' | 'file';
    match: 'name' | 'content';
    excerpt?: string;
  }> = [];
  let scannedFiles = 0;
  let scannedDirectories = 0;
  let stoppedByLimit = false;
  const lowerQuery = query.toLowerCase();

  async function visit(directory: Directory, basePath: string, depth: number): Promise<void> {
    if (results.length >= limit || stoppedByLimit) return;
    scannedDirectories++;
    const entries = directory.list();

    for (const item of entries) {
      if (results.length >= limit || stoppedByLimit) return;

      const itemPath = joinRelativePath(basePath, item.name);
      if (item.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          path: itemPath,
          type: isDirectory(item) ? 'directory' : 'file',
          match: 'name',
        });
      }

      if (isDirectory(item)) {
        if (depth < SEARCH_MAX_DEPTH) {
          await visit(item, itemPath, depth + 1);
        }
        continue;
      }

      scannedFiles++;
      if (scannedFiles > SEARCH_MAX_FILES) {
        stoppedByLimit = true;
        return;
      }

      if (!canSearchText(item)) continue;
      try {
        const text = await item.text();
        const excerpt = makeExcerpt(truncateText(text, SEARCH_TEXT_READ_CHARS), query);
        if (excerpt) {
          results.push({
            path: itemPath,
            type: 'file',
            match: 'content',
            excerpt,
          });
        }
      } catch {
        // Some files selected through SAF are not readable as text; skip them.
      }
    }
  }

  await visit(entry, path, 0);

  return toJson({
    rootId: root.id,
    rootName: root.name,
    path,
    query,
    results,
    scannedFiles,
    scannedDirectories,
    truncated: stoppedByLimit || results.length >= limit,
  });
}
