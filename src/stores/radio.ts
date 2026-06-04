import { create } from 'zustand';
import {
  generateRadioProgram,
  getOrCreateLatestRadioConversation,
  insertRadioChatMessage,
  summarizeRadioSession,
  type RadioProgram,
  type RadioScriptSegment,
} from '../services/aiRadio';
import { playTTSAndWait, stopTTS } from '../services/tts';
import type { Message } from '../types';
import { useMusicStore } from './music';
import { useNeteaseStore } from './netease';
import { useSettingsStore } from './settings';

interface RadioState {
  loading: boolean;
  active: boolean;
  finished: boolean;
  ending: boolean;
  title: string;
  status: string;
  program: RadioProgram | null;
  conversationId: string | null;
  startMessage: Message | null;
  playedTrackCount: number;
  runId: number;

  start: () => Promise<void>;
  end: () => Promise<void>;
}

function combineSegmentText(segments: RadioScriptSegment[]): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join('\n');
}

function waitForTrackFinish(trackId: string, runId: number): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      const radio = useRadioStore.getState();
      const music = useMusicStore.getState();
      return radio.runId !== runId || music.lastFinishedTrackId === trackId;
    };

    if (check()) {
      resolve();
      return;
    }

    const unsubscribe = useMusicStore.subscribe(() => {
      if (check()) {
        unsubscribe();
        resolve();
      }
    });
  });
}

async function playProgram(program: RadioProgram, runId: number): Promise<void> {
  const music = useMusicStore.getState();
  const ttsConfig = useSettingsStore.getState().ttsConfig;
  music.setAutoAdvanceEnabled(false);
  useRadioStore.setState({ playedTrackCount: 0 });

  try {
    for (let index = 0; index < program.tracks.length; index++) {
      if (useRadioStore.getState().runId !== runId) return;

      const introText =
        index === 0
          ? combineSegmentText(program.segments.filter(
              (segment) => segment.position === 'before_track' && (segment.trackIndex ?? 0) === 0
            ))
          : combineSegmentText(program.segments.filter(
              (segment) =>
                segment.position === 'between_tracks' &&
                segment.afterTrackIndex === index - 1 &&
                segment.beforeTrackIndex === index
            ));

      if (introText) {
        useRadioStore.setState({ status: index === 0 ? 'AI 主持开场中...' : 'AI 主持串场中...' });
        await playTTSAndWait(introText, ttsConfig);
      }
      if (useRadioStore.getState().runId !== runId) return;

      useRadioStore.setState({ status: `正在播放 ${index + 1}/${program.tracks.length}` });
      await useMusicStore.getState().playTrackAt(index);
      await waitForTrackFinish(program.tracks[index].id, runId);
      useRadioStore.setState((state) => ({
        playedTrackCount: Math.max(state.playedTrackCount, index + 1),
      }));
    }

    if (useRadioStore.getState().runId !== runId) return;
    const closingText = combineSegmentText(program.segments.filter(
      (segment) => segment.position === 'after_track'
    ));
    if (closingText) {
      useRadioStore.setState({ status: 'AI 主持收尾中...' });
      await playTTSAndWait(closingText, ttsConfig);
    }

    if (useRadioStore.getState().runId !== runId) return;
    useRadioStore.setState({
      finished: true,
      status: '本期已播放完，请手动结束电台以生成总结。',
    });
  } catch (error) {
    if (useRadioStore.getState().runId !== runId) return;
    useRadioStore.setState({
      status: error instanceof Error ? error.message : 'AI 电台播放中断',
    });
  }
}

export const useRadioStore = create<RadioState>((set, get) => ({
  loading: false,
  active: false,
  finished: false,
  ending: false,
  title: 'AI 电台',
  status: '用当前播放器接入一组新歌',
  program: null,
  conversationId: null,
  startMessage: null,
  playedTrackCount: 0,
  runId: 0,

  start: async () => {
    const state = get();
    if (state.loading || state.active) return;

    const settings = useSettingsStore.getState();
    const apiConfig = settings.apiConfigs[settings.activeConfigIndex];
    if (!apiConfig?.baseUrl || !apiConfig.apiKey || !apiConfig.model) {
      set({ status: '请先在设置中配置聊天 API' });
      return;
    }

    const netease = useNeteaseStore.getState();
    if (!netease.baseUrl.trim()) {
      set({ status: '请先在歌单管理里填写网易云 API 地址' });
      return;
    }

    if (!settings.ttsConfig.apiKey || !settings.ttsConfig.groupId || !settings.ttsConfig.voiceId) {
      set({ status: '请先在设置中配置 TTS，电台主持需要语音。' });
      return;
    }

    set({ loading: true, status: '正在调频，生成固定节目和台词...' });
    try {
      const music = useMusicStore.getState();
      const program = await generateRadioProgram({
        apiConfig,
        neteaseBaseUrl: netease.baseUrl,
        neteaseCookie: netease.cookie,
        currentTracks: music.tracks,
        count: 8,
      });

      const conversation = await getOrCreateLatestRadioConversation(apiConfig);
      const startMessage = await insertRadioChatMessage(
        conversation.id,
        'system',
        `AI 电台已开启：${program.summary}\n播放完成后请手动结束电台以生成总结。`
      );

      const runId = get().runId + 1;
      music.replaceTracks(program.tracks);
      set({
        runId,
        active: true,
        finished: false,
        title: program.title,
        program,
        conversationId: conversation.id,
        startMessage,
        playedTrackCount: 0,
        status:
          program.skipped.length > 0
            ? `已生成 ${program.tracks.length} 首，跳过 ${program.skipped.length} 首，准备开场。`
            : `已生成 ${program.tracks.length} 首，准备开场。`,
      });

      playProgram(program, runId).catch(() => undefined);
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'AI 电台开台失败' });
    } finally {
      set({ loading: false });
    }
  },

  end: async () => {
    const state = get();
    if (state.ending || !state.active) return;

    const settings = useSettingsStore.getState();
    const apiConfig = settings.apiConfigs[settings.activeConfigIndex];
    if (!apiConfig || !state.program || !state.startMessage || !state.conversationId) {
      set({ status: '没有可结束的电台会话。' });
      return;
    }

    const nextRunId = state.runId + 1;
    set({ ending: true, runId: nextRunId, status: '正在结束电台并生成总结...' });
    await stopTTS();
    await useMusicStore.getState().pause();
    useMusicStore.getState().setAutoAdvanceEnabled(true);

    try {
      const endMessage = await insertRadioChatMessage(
        state.conversationId,
        'system',
        `AI 电台已结束：本期播放 ${state.playedTrackCount}/${state.program.tracks.length} 首，正在整理总结。`
      );
      const summary = await summarizeRadioSession({
        apiConfig,
        conversationId: state.conversationId,
        startMessage: state.startMessage,
        endMessage,
        program: state.program,
        playedTrackCount: state.playedTrackCount,
      });
      await insertRadioChatMessage(state.conversationId, 'assistant', summary);

      set({
        active: false,
        finished: false,
        program: null,
        conversationId: null,
        startMessage: null,
        status: '本期总结已插入聊天。',
      });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'AI 电台结束失败' });
    } finally {
      set({ ending: false });
    }
  },
}));
