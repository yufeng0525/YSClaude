import { chatCompletion } from './api';
import { searchNeteaseTrack } from './neteaseMusic';
import { randomUUID } from 'expo-crypto';
import type { MusicTrack } from '../stores/music';
import type { APIConfig, Conversation, Message } from '../types';
import {
  createConversation,
  getAllConversations,
  getMessagesByConversation,
  insertMessage,
  updateConversation,
} from '../db/operations';
import { useChatStore } from '../stores/chat';

export interface RadioSongSuggestion {
  title: string;
  artist?: string;
  query?: string;
  reason?: string;
}

export interface RadioPlan {
  title: string;
  songs: RadioSongSuggestion[];
  reason?: string;
}

export interface RadioPlaylistResult {
  title: string;
  reason?: string;
  tracks: MusicTrack[];
  skipped: RadioSongSuggestion[];
}

export interface RadioScriptSegment {
  type: 'cold_open' | 'bridge' | 'closing' | 'silence';
  position: 'before_track' | 'between_tracks' | 'after_track';
  trackIndex?: number;
  afterTrackIndex?: number;
  beforeTrackIndex?: number;
  text: string;
}

export interface RadioProgram {
  title: string;
  summary: string;
  reason?: string;
  tracks: MusicTrack[];
  skipped: RadioSongSuggestion[];
  segments: RadioScriptSegment[];
}

interface GenerateRadioPlaylistOptions {
  apiConfig: APIConfig;
  neteaseBaseUrl: string;
  neteaseCookie: string;
  currentTracks: MusicTrack[];
  count?: number;
}

interface GenerateRadioProgramOptions extends GenerateRadioPlaylistOptions {}

interface RadioScriptPlan {
  title: string;
  summary: string;
  segments: RadioScriptSegment[];
  reason?: string;
}

function formatCurrentQueue(tracks: MusicTrack[]): string {
  if (tracks.length === 0) return '(empty)';
  return tracks
    .slice(0, 12)
    .map((track, index) => `${index + 1}. ${track.title} - ${track.artist}`)
    .join('\n');
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('AI 电台没有返回可解析的 JSON');
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function normalizeSong(item: unknown): RadioSongSuggestion | null {
  if (typeof item === 'string') {
    const [title, ...artistParts] = item.split(' - ');
    const cleanTitle = title?.trim();
    if (!cleanTitle) return null;
    return {
      title: cleanTitle,
      artist: artistParts.join(' - ').trim() || undefined,
      query: item.trim(),
    };
  }

  if (!item || typeof item !== 'object') return null;
  const raw = item as Record<string, unknown>;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const artist = typeof raw.artist === 'string' ? raw.artist.trim() : '';
  const query = typeof raw.query === 'string' ? raw.query.trim() : '';
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (!title && !query) return null;

  return {
    title: title || query,
    artist: artist || undefined,
    query: query || [title, artist].filter(Boolean).join(' - '),
    reason: reason || undefined,
  };
}

function normalizePlan(value: unknown): RadioPlan {
  if (!value || typeof value !== 'object') {
    throw new Error('AI 电台返回格式不正确');
  }

  const raw = value as Record<string, unknown>;
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'AI 电台';
  const rawSongs = Array.isArray(raw.songs) ? raw.songs : Array.isArray(raw.play) ? raw.play : [];
  const songs = rawSongs
    .map(normalizeSong)
    .filter((song): song is RadioSongSuggestion => !!song);

  if (songs.length === 0) {
    throw new Error('AI 电台没有生成歌曲');
  }

  return {
    title,
    songs,
    reason: typeof raw.reason === 'string' ? raw.reason.trim() : undefined,
  };
}

function normalizeSegment(item: unknown): RadioScriptSegment | null {
  if (!item || typeof item !== 'object') return null;
  const raw = item as Record<string, unknown>;
  const type = raw.type === 'bridge' || raw.type === 'closing' || raw.type === 'silence'
    ? raw.type
    : 'cold_open';
  const position = raw.position === 'between_tracks' || raw.position === 'after_track'
    ? raw.position
    : 'before_track';
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';

  return {
    type,
    position,
    trackIndex: typeof raw.trackIndex === 'number' ? raw.trackIndex : undefined,
    afterTrackIndex: typeof raw.afterTrackIndex === 'number' ? raw.afterTrackIndex : undefined,
    beforeTrackIndex: typeof raw.beforeTrackIndex === 'number' ? raw.beforeTrackIndex : undefined,
    text,
  };
}

function normalizeScriptPlan(value: unknown, fallbackTitle: string): RadioScriptPlan {
  if (!value || typeof value !== 'object') {
    throw new Error('AI 电台脚本格式不正确');
  }

  const raw = value as Record<string, unknown>;
  const segments = (Array.isArray(raw.segments) ? raw.segments : [])
    .map(normalizeSegment)
    .filter((segment): segment is RadioScriptSegment => !!segment);
  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 100) : '';

  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : fallbackTitle,
    summary: summary || `${fallbackTitle} 已开台，播放完成后请手动结束以生成总结。`.slice(0, 100),
    segments,
    reason: typeof raw.reason === 'string' ? raw.reason.trim() : undefined,
  };
}

function formatTracksForPrompt(tracks: MusicTrack[]): string {
  return tracks
    .map((track, index) => `${index}. ${track.title} - ${track.artist}${track.album ? `（${track.album}）` : ''}`)
    .join('\n');
}

async function generateRadioPlan(
  apiConfig: APIConfig,
  currentTracks: MusicTrack[],
  count: number
): Promise<RadioPlan> {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const queue = formatCurrentQueue(currentTracks);

  const response = await chatCompletion({
    baseUrl: apiConfig.baseUrl,
    apiKey: apiConfig.apiKey,
    model: apiConfig.model,
    temperature: 0.85,
    maxTokens: 1200,
    messages: [
      {
        role: 'system',
        content:
          '你是一个私人 AI 电台节目策划。只输出严格 JSON，不要 Markdown，不要解释。',
      },
      {
        role: 'user',
        content: [
          '参考 Claudio-FM 的节目思路：像电台主持人在开台，而不是像聊天助手推荐歌。',
          '现在只需要生成一批可搜索、可播放的歌曲，不生成 TTS 播报。',
          `当前时间：${now}`,
          `当前队列：\n${queue}`,
          `请生成 ${count} 首歌，形成一段有连贯氛围的私人电台歌单。`,
          '避免重复当前队列里的歌曲。尽量让歌名和歌手保持原语言，方便网易云搜索。',
          '返回 JSON 结构：{"title":"2-8字电台节目名","songs":[{"title":"歌名","artist":"歌手","query":"歌名 - 歌手","reason":"一句内部推荐理由"}],"reason":"整体氛围理由"}',
        ].join('\n\n'),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('AI 电台没有返回内容');
  }
  return normalizePlan(extractJsonObject(content));
}

export async function generateRadioPlaylist({
  apiConfig,
  neteaseBaseUrl,
  neteaseCookie,
  currentTracks,
  count = 8,
}: GenerateRadioPlaylistOptions): Promise<RadioPlaylistResult> {
  const plan = await generateRadioPlan(apiConfig, currentTracks, count);
  const tracks: MusicTrack[] = [];
  const skipped: RadioSongSuggestion[] = [];
  const seen = new Set<string>();

  for (const song of plan.songs) {
    const query = song.query || [song.title, song.artist].filter(Boolean).join(' - ');
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const track = await searchNeteaseTrack(neteaseBaseUrl, neteaseCookie, query);
      if (track) {
        tracks.push(track);
      } else {
        skipped.push(song);
      }
    } catch {
      skipped.push(song);
    }
  }

  if (tracks.length === 0) {
    throw new Error('AI 电台生成了歌单，但没有解析到可播放歌曲');
  }

  return {
    title: plan.title,
    reason: plan.reason,
    tracks,
    skipped,
  };
}

async function generateRadioScriptPlan(
  apiConfig: APIConfig,
  title: string,
  tracks: MusicTrack[],
  reason?: string
): Promise<RadioScriptPlan> {
  const response = await chatCompletion({
    baseUrl: apiConfig.baseUrl,
    apiKey: apiConfig.apiKey,
    model: apiConfig.model,
    temperature: 0.8,
    maxTokens: 1800,
    messages: [
      {
        role: 'system',
        content:
          '你是一个私人 AI 电台主持。只输出严格 JSON，不要 Markdown，不要解释。台词要克制、自然、有电台节目感。',
      },
      {
        role: 'user',
        content: [
          `节目名：${title}`,
          reason ? `选歌理由：${reason}` : '',
          `已确认可播放歌曲：\n${formatTracksForPrompt(tracks)}`,
          '请基于这些真实可播歌曲生成本期固定脚本。',
          '要求：summary 必须少于 100 个汉字，用于插入主聊天；segments 包含开场、歌间串词和结尾。',
          '开场放在第一首前，歌间串词放在相邻歌曲之间，结尾放在最后一首后。',
          '不是每段都要很长，歌间串词 1-2 句即可；如果某处适合安静，可以输出 silence 且 text 为空。',
          '只能提到上方已确认歌曲，不要编造不可播放歌曲。',
          '返回 JSON：{"title":"节目名","summary":"100字内摘要","segments":[{"type":"cold_open","position":"before_track","trackIndex":0,"text":"开场台词"},{"type":"bridge","position":"between_tracks","afterTrackIndex":0,"beforeTrackIndex":1,"text":"串词"},{"type":"closing","position":"after_track","trackIndex":最后一首索引,"text":"结尾台词"}],"reason":"内部理由"}',
        ].filter(Boolean).join('\n\n'),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('AI 电台没有返回脚本');
  }
  return normalizeScriptPlan(extractJsonObject(content), title);
}

export async function generateRadioProgram(options: GenerateRadioProgramOptions): Promise<RadioProgram> {
  const playlist = await generateRadioPlaylist(options);
  const script = await generateRadioScriptPlan(
    options.apiConfig,
    playlist.title,
    playlist.tracks,
    playlist.reason
  );

  return {
    title: script.title,
    summary: script.summary,
    reason: script.reason || playlist.reason,
    tracks: playlist.tracks,
    skipped: playlist.skipped,
    segments: script.segments,
  };
}

export async function getOrCreateLatestRadioConversation(apiConfig: APIConfig): Promise<Conversation> {
  const conversations = await getAllConversations();
  const latest = conversations[0];
  if (latest) return latest;

  const now = Date.now();
  const conversation: Conversation = {
    id: randomUUID(),
    title: 'AI 电台',
    systemPrompt: 'You are a helpful assistant.',
    model: apiConfig.model,
    createdAt: now,
    updatedAt: now,
  };
  await createConversation(conversation);
  return conversation;
}

export async function insertRadioChatMessage(
  conversationId: string,
  role: Message['role'],
  content: string
): Promise<Message> {
  const message: Message = {
    id: randomUUID(),
    role,
    content,
    createdAt: Date.now(),
  };
  await insertMessage(conversationId, message);
  await updateConversation(conversationId, { updatedAt: Date.now() });

  const chat = useChatStore.getState();
  if (chat.conversationId === conversationId) {
    useChatStore.setState((state) => ({
      messages: [...state.messages, message],
    }));
  }

  return message;
}

function formatChatMessages(messages: Message[]): string {
  if (messages.length === 0) return '(无聊天内容)';
  return messages
    .map((message) => {
      const speaker =
        message.role === 'user' ? '用户' :
        message.role === 'assistant' ? 'AI' :
        message.role === 'system' ? '系统' : '工具';
      return `${speaker}: ${message.content}`;
    })
    .join('\n');
}

function formatRadioProgramLog(program: RadioProgram, playedTrackCount: number): string {
  const tracks = program.tracks
    .slice(0, playedTrackCount)
    .map((track, index) => `${index + 1}. ${track.title} - ${track.artist}`)
    .join('\n');
  const lines = program.segments
    .filter((segment) => segment.text.trim())
    .map((segment) => `- ${segment.type}/${segment.position}: ${segment.text}`)
    .join('\n');

  return [
    `节目：${program.title}`,
    `摘要：${program.summary}`,
    `已播放歌曲：\n${tracks || '(无)'}`,
    `电台台词：\n${lines || '(无)'}`,
  ].join('\n\n');
}

export async function summarizeRadioSession({
  apiConfig,
  conversationId,
  startMessage,
  endMessage,
  program,
  playedTrackCount,
}: {
  apiConfig: APIConfig;
  conversationId: string;
  startMessage: Message;
  endMessage: Message;
  program: RadioProgram;
  playedTrackCount: number;
}): Promise<string> {
  const messages = await getMessagesByConversation(conversationId);
  const scopedMessages = messages.filter(
    (message) => message.createdAt >= startMessage.createdAt && message.createdAt <= endMessage.createdAt
  );

  const response = await chatCompletion({
    baseUrl: apiConfig.baseUrl,
    apiKey: apiConfig.apiKey,
    model: apiConfig.model,
    temperature: 0.5,
    maxTokens: 900,
    messages: [
      {
        role: 'system',
        content:
          '你是 AI 电台节目记录员。请根据给定边界内的聊天、电台台词和歌曲，生成简短自然的本期总结，直接给用户看。',
      },
      {
        role: 'user',
        content: [
          '# 电台内部日志',
          formatRadioProgramLog(program, playedTrackCount),
          '# 开始/结束边界内聊天',
          formatChatMessages(scopedMessages),
          '请输出 120 字以内中文总结。不要列清单，不要编造未出现的内容。',
        ].join('\n\n'),
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() || '本期 AI 电台已结束，节目记录已整理。';
}
