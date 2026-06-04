import { createAudioPlayer, type AudioStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { TTSConfig } from '../stores/settings';

let currentPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let currentSubscription: { remove: () => void } | null = null;
let currentWaitResolve: (() => void) | null = null;

async function createTTSPlayer(text: string, config: TTSConfig): Promise<ReturnType<typeof createAudioPlayer>> {
  if (!config.apiKey || !config.groupId) {
    throw new Error('请先配置 MiniMax Group ID 和 API Key');
  }
  if (!config.voiceId) {
    throw new Error('请先配置 Voice ID');
  }

  const url = `https://api.minimax.chat/v1/t2a_v2?GroupId=${encodeURIComponent(config.groupId)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      text,
      stream: false,
      voice_setting: {
        voice_id: config.voiceId,
        speed: config.speed,
        vol: config.vol,
        pitch: config.pitch,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`MiniMax TTS Error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();

  if (data.base_resp?.status_code !== 0) {
    throw new Error(data.base_resp?.status_msg || 'TTS 请求失败');
  }

  const audioHex = data.data?.audio;
  if (!audioHex) {
    throw new Error('未返回音频数据');
  }

  const audioBytes = hexToBytes(audioHex);
  const file = new File(Paths.cache, 'tts_audio.mp3');
  const writable = file.writableStream();
  const writer = writable.getWriter();
  await writer.write(audioBytes);
  await writer.close();

  return createAudioPlayer(file.uri);
}

export async function playTTS(text: string, config: TTSConfig): Promise<void> {
  await stopTTS();
  currentPlayer = await createTTSPlayer(text, config);
  currentPlayer.play();
}

export async function playTTSAndWait(text: string, config: TTSConfig): Promise<void> {
  await stopTTS();
  currentPlayer = await createTTSPlayer(text, config);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      currentSubscription?.remove();
      currentSubscription = null;
      currentWaitResolve = null;
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    currentWaitResolve = () => finish();
    currentSubscription = currentPlayer?.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (status.error) {
        finish(new Error(status.error));
        return;
      }
      if (status.didJustFinish) {
        finish();
      }
    }) ?? null;
    currentPlayer?.play();
  });

  await stopTTS();
}

export async function stopTTS(): Promise<void> {
  currentSubscription?.remove();
  currentSubscription = null;
  currentWaitResolve?.();
  currentWaitResolve = null;
  if (currentPlayer) {
    currentPlayer.pause();
    currentPlayer.release();
    currentPlayer = null;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
