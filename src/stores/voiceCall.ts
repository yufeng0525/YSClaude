import { create } from 'zustand';
import {
  AndroidVoiceCallSession,
  isAndroidVoiceCallAvailable,
  type VoiceCallSnapshot,
} from '../services/voiceCallSession';
import {
  hideVoiceCallFloatingBall,
  showVoiceCallFloatingBall,
} from '../services/floatingBall';

export const INITIAL_VOICE_CALL_SNAPSHOT: VoiceCallSnapshot = {
  active: false,
  status: 'idle',
  startedAt: null,
  micEnabled: true,
  speakerphoneOn: false,
  partialTranscript: '',
  lastUserText: '',
  speakingText: '',
  transcriptItems: [],
  error: null,
};

type Subscription = { remove: () => void };

interface VoiceCallStore {
  snapshot: VoiceCallSnapshot;
  starting: boolean;
  minimized: boolean;
  startCall: () => Promise<void>;
  stopCall: () => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setSpeakerphoneOn: (enabled: boolean) => Promise<void>;
  minimizeToFloatingBall: (durationText: string) => Promise<void>;
  restoreFromFloatingBall: () => Promise<void>;
}

let session: AndroidVoiceCallSession | null = null;
let sessionSubscription: Subscription | null = null;

export const useVoiceCallStore = create<VoiceCallStore>((set, get) => ({
  snapshot: INITIAL_VOICE_CALL_SNAPSHOT,
  starting: false,
  minimized: false,

  startCall: async () => {
    const current = get();
    if (current.snapshot.active || current.starting) return;
    if (!isAndroidVoiceCallAvailable()) {
      throw new Error('实时语音通话目前只支持 Android 自定义构建。');
    }

    set({ starting: true, minimized: false });
    const nextSession = new AndroidVoiceCallSession();
    session = nextSession;
    sessionSubscription?.remove();
    sessionSubscription = nextSession.subscribe((snapshot) => {
      set({ snapshot });
    });

    try {
      await nextSession.start();
    } catch (error) {
      sessionSubscription?.remove();
      sessionSubscription = null;
      session = null;
      const message = error instanceof Error ? error.message : '语音通话启动失败';
      set({
        starting: false,
        minimized: false,
        snapshot: { ...INITIAL_VOICE_CALL_SNAPSHOT, status: 'error', error: message },
      });
      throw error;
    }

    set({ starting: false });
  },

  stopCall: async () => {
    const activeSession = session;
    session = null;
    sessionSubscription?.remove();
    sessionSubscription = null;
    set({ starting: false, minimized: false });
    await hideVoiceCallFloatingBall().catch(() => undefined);
    if (activeSession) {
      await activeSession.stop();
    }
    set({ snapshot: INITIAL_VOICE_CALL_SNAPSHOT });
  },

  setMicrophoneEnabled: async (enabled: boolean) => {
    await session?.setMicrophoneEnabled(enabled);
  },

  setSpeakerphoneOn: async (enabled: boolean) => {
    await session?.setSpeakerphoneOn(enabled);
  },

  minimizeToFloatingBall: async (durationText: string) => {
    if (!get().snapshot.active) return;
    await showVoiceCallFloatingBall(durationText);
    set({ minimized: true });
  },

  restoreFromFloatingBall: async () => {
    await hideVoiceCallFloatingBall().catch(() => undefined);
    set({ minimized: false });
  },
}));

