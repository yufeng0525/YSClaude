import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView } from '@livekit/react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Mic,
  MicOff,
  PhoneOff,
  PictureInPicture2,
  RotateCcw,
  SwitchCamera,
  SlidersHorizontal,
  X,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import {
  createDefaultVoiceCallTuningConfig,
  useSettingsStore,
  type VoiceCallTuningConfig,
} from '../src/stores/settings';
import { useVoiceCallStore } from '../src/stores/voiceCall';

type TuningField = {
  key: keyof VoiceCallTuningConfig;
  label: string;
  unit: string;
  step: number;
  decimals?: number;
  group: string;
};

const TUNING_FIELDS: TuningField[] = [
  { key: 'aliyunUserTurnGraceMs', label: '用户句子提交延迟', unit: 'ms', step: 100, group: '阿里 STT' },
  { key: 'aliyunPendingFlushMs', label: '转写刷新等待', unit: 'ms', step: 100, group: '阿里 STT' },
  { key: 'aliyunInterimOnlyFlushGraceMs', label: '仅临时结果等待 final', unit: 'ms', step: 200, group: '阿里 STT' },
  { key: 'userTurnRecentAudioHoldMs', label: '连续说话保留窗口', unit: 'ms', step: 50, group: '用户回合' },
  { key: 'playbackRecognitionSuppressMs', label: '播放识别抑制', unit: 'ms', step: 100, group: '播放/打断' },
  { key: 'deferredBargeInVolume', label: '打断时 TTS 音量', unit: '', step: 0.05, decimals: 2, group: '播放/打断' },
  { key: 'deferredBargeInMaxMs', label: '打断最大保留时间', unit: 'ms', step: 1000, group: '播放/打断' },
  { key: 'bargeInMinSpeechMs', label: '打断最短语音', unit: 'ms', step: 10, group: '原生打断' },
  { key: 'bargeInRmsFloor', label: '打断 RMS 下限', unit: '', step: 20, group: '原生打断' },
  { key: 'bargeInEchoMultiplier', label: '回声阈值倍率', unit: 'x', step: 0.05, decimals: 2, group: '原生打断' },
  { key: 'bargeInPeakThreshold', label: '打断峰值阈值', unit: '', step: 50, group: '原生打断' },
  { key: 'bargeInClearPeakThreshold', label: '强语音峰值阈值', unit: '', step: 100, group: '原生打断' },
  { key: 'bargeInClearRmsThreshold', label: '强语音 RMS 阈值', unit: '', step: 20, group: '原生打断' },
  { key: 'playbackMicSuppressMs', label: '播放中麦克风抑制', unit: 'ms', step: 100, group: '原生打断' },
  { key: 'afterPlaybackSuppressMs', label: '播放后麦克风抑制', unit: 'ms', step: 100, group: '原生打断' },
  { key: 'micStartMinSpeechMs', label: '麦克风起声时长', unit: 'ms', step: 10, group: '麦克风 VAD' },
  { key: 'micEndSilenceMs', label: '麦克风结束静音', unit: 'ms', step: 100, group: '麦克风 VAD' },
  { key: 'micTrailingAudioMs', label: '尾音保留', unit: 'ms', step: 100, group: '麦克风 VAD' },
  { key: 'micMinStartRms', label: '起声 RMS 下限', unit: '', step: 20, group: '麦克风 VAD' },
  { key: 'micMinActiveRms', label: '持续 RMS 下限', unit: '', step: 20, group: '麦克风 VAD' },
];

function formatDuration(startedAt: number | null): string {
  if (!startedAt) return '00:00';
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
  const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatStatus(status: string, error: string | null): string {
  if (error) return error;
  switch (status) {
    case 'connecting':
      return '正在连接';
    case 'listening':
      return '通话中';
    case 'thinking':
      return '正在思考';
    case 'speaking':
      return '正在说话';
    case 'stopping':
      return '正在挂断';
    default:
      return '通话中';
  }
}

export default function VoiceCallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const wasCallActiveRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const [durationText, setDurationText] = useState('00:00');
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [tuningOpen, setTuningOpen] = useState(false);
  const snapshot = useVoiceCallStore((state) => state.snapshot);
  const starting = useVoiceCallStore((state) => state.starting);
  const startCall = useVoiceCallStore((state) => state.startCall);
  const stopCall = useVoiceCallStore((state) => state.stopCall);
  const setMicrophoneEnabled = useVoiceCallStore((state) => state.setMicrophoneEnabled);
  const setSpeakerphoneOn = useVoiceCallStore((state) => state.setSpeakerphoneOn);
  const minimizeToFloatingBall = useVoiceCallStore((state) => state.minimizeToFloatingBall);
  const restoreFromFloatingBall = useVoiceCallStore((state) => state.restoreFromFloatingBall);
  const mode = useVoiceCallStore((state) => state.mode);
  const cameraFacing = useVoiceCallStore((state) => state.cameraFacing);
  const setCameraFacing = useVoiceCallStore((state) => state.setCameraFacing);
  const localVideoTrack = useVoiceCallStore((state) => state.localVideoTrack);
  const setVisualFrameProvider = useVoiceCallStore((state) => state.setVisualFrameProvider);
  const appearanceConfig = useSettingsStore((state) => state.appearanceConfig);
  const voiceCallTuningConfig = useSettingsStore((state) => state.voiceCallTuningConfig);
  const isLiveKit = useSettingsStore((state) => state.voiceCallEngine === 'livekit');
  const setVoiceCallTuningConfig = useSettingsStore((state) => state.setVoiceCallTuningConfig);
  const assistantName = (appearanceConfig?.assistantDisplayName || 'Claude').trim() || 'Claude';
  const assistantAvatarUri = appearanceConfig?.assistantAvatarImageUri;
  const callBackgroundUri = useSettingsStore((state) => state.voiceCallBackgroundImageUri);
  // Screen sharing captures the device in the background, but keeps the same
  // on-screen layout as a voice call. Only camera video uses the visual layout.
  const isVisualCall = mode === 'video';
  const hasCallError = !!snapshot.error || snapshot.status === 'error';
  const canHangup = snapshot.active || hasCallError;

  const transcriptItems = useMemo(() => {
    const items = [...snapshot.transcriptItems];
    if (snapshot.partialTranscript) {
      items.push({
        id: 'partial',
        speaker: 'user' as const,
        text: snapshot.partialTranscript,
      });
    } else if (snapshot.speakingText && items[items.length - 1]?.speaker !== 'assistant') {
      items.push({
        id: 'speaking',
        speaker: 'assistant' as const,
        text: snapshot.speakingText,
      });
    }
    return items;
  }, [snapshot.partialTranscript, snapshot.speakingText, snapshot.transcriptItems]);

  useEffect(() => {
    restoreFromFloatingBall().catch(() => undefined);
  }, [restoreFromFloatingBall]);

  useEffect(() => {
    if (wasCallActiveRef.current && !snapshot.active) {
      router.replace('/');
    }
    wasCallActiveRef.current = snapshot.active;
  }, [router, snapshot.active]);

  useEffect(() => {
    if (!isLiveKit && mode === 'video' && !cameraPermission?.granted) {
      requestCameraPermission().catch(() => undefined);
    }
  }, [cameraPermission?.granted, isLiveKit, mode, requestCameraPermission]);

  useEffect(() => {
    // Screen sharing owns its frame provider at session level so minimizing to the
    // floating ball does not clear it when this screen unmounts.
    if (isLiveKit || mode === 'screen') return;
    if (!snapshot.active || mode === 'voice') {
      setVisualFrameProvider(null);
      return;
    }
    setVisualFrameProvider(async () => {
      const picture = await cameraRef.current?.takePictureAsync({ quality: 0.72, skipProcessing: false });
      return picture?.uri || null;
    });
    return () => setVisualFrameProvider(null);
  }, [isLiveKit, mode, setVisualFrameProvider, snapshot.active]);

  useEffect(() => {
    setDurationText(formatDuration(snapshot.startedAt));
    const timer = setInterval(() => {
      setDurationText(formatDuration(snapshot.startedAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [snapshot.startedAt]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [transcriptItems.length, snapshot.partialTranscript, snapshot.speakingText]);

  const handleMinimize = async () => {
    try {
      // The minimized video window is an AI portrait, not a live camera preview.
      // Always use the configured call background and never take a photo here.
      await minimizeToFloatingBall(durationText, mode === 'video' ? callBackgroundUri : undefined);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } catch (error: any) {
      Alert.alert('悬浮球不可用', error?.message || '请开启悬浮窗权限后再试。');
    }
  };

  const handleHangup = async () => {
    await stopCall();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleSwitchCamera = async () => {
    try {
      await setCameraFacing(cameraFacing === 'front' ? 'back' : 'front');
    } catch (error: any) {
      Alert.alert('切换摄像头失败', error?.message || '无法切换前后置摄像头');
    }
  };

  const handleStart = async () => {
    try {
      await startCall();
    } catch (error: any) {
      Alert.alert('语音通话启动失败', error?.message || '请检查 Deepgram 和 MiniMax 配置');
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#2a2a2a', '#1a1a1a', '#222222', '#171717']}
        locations={[0, 0.42, 0.72, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {isVisualCall && callBackgroundUri && !cameraExpanded && (
        <Image source={{ uri: callBackgroundUri }} style={styles.visualBackground} resizeMode="cover" />
      )}
      {!isLiveKit && mode === 'video' && cameraPermission?.granted && cameraExpanded && (
        <CameraView
          ref={cameraRef}
          style={styles.visualBackground}
          facing={cameraFacing}
          mirror={cameraFacing === 'front'}
          flash="off"
          enableTorch={false}
        />
      )}
      {isLiveKit && mode === 'video' && localVideoTrack && cameraExpanded && (
        <VideoView
          style={styles.visualBackground}
          videoTrack={localVideoTrack}
          objectFit="cover"
          mirror={cameraFacing === 'front'}
        />
      )}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.pipButton} onPress={handleMinimize} disabled={!snapshot.active}>
          <PictureInPicture2 size={27} color="rgba(255,255,255,0.78)" strokeWidth={1.7} />
        </Pressable>
        <Pressable style={styles.tuningButton} onPress={() => mode === 'video' ? void handleSwitchCamera() : setTuningOpen(true)}>
          {mode === 'video' ? (
            <SwitchCamera size={25} color="rgba(255,255,255,0.9)" strokeWidth={1.9} />
          ) : (
            <SlidersHorizontal size={24} color="rgba(255,255,255,0.82)" strokeWidth={1.9} />
          )}
        </Pressable>
      </View>

      {!isLiveKit && mode === 'video' && cameraPermission?.granted && !cameraExpanded && (
        <Pressable style={[styles.cameraWindow, { top: insets.top + 66 }]} onPress={() => setCameraExpanded(true)}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={cameraFacing}
            mirror={cameraFacing === 'front'}
            flash="off"
            enableTorch={false}
          />
        </Pressable>
      )}
      {isLiveKit && mode === 'video' && localVideoTrack && !cameraExpanded && (
        <Pressable style={[styles.cameraWindow, { top: insets.top + 66 }]} onPress={() => setCameraExpanded(true)}>
          <VideoView
            style={StyleSheet.absoluteFill}
            videoTrack={localVideoTrack}
            objectFit="cover"
            mirror={cameraFacing === 'front'}
          />
        </Pressable>
      )}
      {!isLiveKit && mode === 'video' && cameraExpanded && callBackgroundUri && (
        <Pressable style={[styles.cameraWindow, { top: insets.top + 66 }]} onPress={() => setCameraExpanded(false)}>
          <Image source={{ uri: callBackgroundUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </Pressable>
      )}
      {isLiveKit && mode === 'video' && cameraExpanded && callBackgroundUri && (
        <Pressable style={[styles.cameraWindow, { top: insets.top + 66 }]} onPress={() => setCameraExpanded(false)}>
          <Image source={{ uri: callBackgroundUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </Pressable>
      )}

      <VoiceTuningModal
        visible={tuningOpen}
        config={voiceCallTuningConfig}
        onClose={() => setTuningOpen(false)}
        onChange={setVoiceCallTuningConfig}
        onReset={() => setVoiceCallTuningConfig(createDefaultVoiceCallTuningConfig())}
      />

      {!isVisualCall && <View style={styles.profileSection}>
        <View style={styles.avatar}>
          {assistantAvatarUri ? (
            <Image source={{ uri: assistantAvatarUri }} style={styles.avatarImage} resizeMode="cover" />
          ) : (
            <Text style={styles.avatarFallback}>AI</Text>
          )}
        </View>
        <Text style={styles.nickname} numberOfLines={1}>{assistantName}</Text>
        <Text style={styles.duration}>{durationText}</Text>
      </View>}

      <View style={[styles.transcriptShade, isVisualCall && styles.transcriptShadeVisual]}>
      <ScrollView
        ref={scrollRef}
        style={styles.transcript}
        contentContainerStyle={styles.transcriptContent}
        showsVerticalScrollIndicator={false}
      >
        {transcriptItems.length === 0 ? (
          <View style={styles.emptyTranscript}>
            <Text style={styles.emptyTranscriptText}>
              {starting || snapshot.status === 'connecting' ? '正在连接语音通话...' : '开始说话后，通话文字会显示在这里'}
            </Text>
          </View>
        ) : (
          transcriptItems.map((item) => {
            const isAssistant = item.speaker === 'assistant';
            const active = item.id === 'partial' || item.id === 'speaking';
            return (
              <View
                key={item.id}
                style={[
                  styles.transcriptItem,
                  isVisualCall && styles.transcriptBubble,
                  isVisualCall && (isAssistant ? styles.aiTranscriptBubble : styles.userTranscriptBubble),
                ]}
              >
                <Text style={[styles.speaker, isAssistant && styles.aiSpeaker]}>
                  {isAssistant ? assistantName : '我'}
                </Text>
                <Text style={[styles.transcriptText, isAssistant && styles.aiTranscriptText, active && styles.activeTranscriptText]}>
                  {item.text}
                  {active ? '|' : ''}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
      </View>

      <Text style={[styles.statusText, snapshot.error && styles.errorText]} numberOfLines={2}>
        {formatStatus(snapshot.status, snapshot.error)}
      </Text>

      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}>
        <ControlButton
          label={snapshot.micEnabled ? '麦克风已开' : '麦克风已关'}
          active={snapshot.micEnabled}
          disabled={!snapshot.active}
          onPress={() => setMicrophoneEnabled(!snapshot.micEnabled)}
          Icon={snapshot.micEnabled ? Mic : MicOff}
        />
        <Pressable style={styles.hangupButton} onPress={canHangup ? handleHangup : handleStart} disabled={starting && !hasCallError}>
          <View style={styles.hangupCircle}>
            {starting && !hasCallError ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : hasCallError ? (
              <X size={34} color="#FFFFFF" strokeWidth={2.4} />
            ) : (
              <PhoneOff size={32} color="#FFFFFF" strokeWidth={2.4} />
            )}
          </View>
          <Text style={styles.controlLabel}>{hasCallError ? '退出' : snapshot.active ? '挂断' : '开始'}</Text>
        </Pressable>
        <ControlButton
          label={snapshot.speakerphoneOn ? '扬声器已开' : '听筒模式'}
          active={snapshot.speakerphoneOn}
          disabled={!snapshot.active}
          onPress={() => setSpeakerphoneOn(!snapshot.speakerphoneOn)}
          Icon={snapshot.speakerphoneOn ? Volume2 : VolumeX}
        />
      </View>
    </View>
  );
}

function ControlButton({
  label,
  active,
  disabled,
  onPress,
  Icon,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
}) {
  return (
    <Pressable style={[styles.controlButton, disabled && styles.controlDisabled]} onPress={onPress} disabled={disabled}>
      <View style={[styles.controlCircle, active ? styles.controlCircleActive : styles.controlCircleInactive]}>
        <Icon size={28} color={active ? '#222222' : '#FFFFFF'} strokeWidth={2.2} />
      </View>
      <Text style={styles.controlLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function VoiceTuningModal({
  visible,
  config,
  onClose,
  onChange,
  onReset,
}: {
  visible: boolean;
  config: VoiceCallTuningConfig;
  onClose: () => void;
  onChange: (config: Partial<VoiceCallTuningConfig>) => void;
  onReset: () => void;
}) {
  const groups = useMemo(() => {
    return TUNING_FIELDS.reduce<Array<{ title: string; fields: TuningField[] }>>((result, field) => {
      const group = result.find((item) => item.title === field.group);
      if (group) {
        group.fields.push(field);
      } else {
        result.push({ title: field.group, fields: [field] });
      }
      return result;
    }, []);
  }, []);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.tuningPanel}>
          <View style={styles.tuningHeader}>
            <Text style={styles.tuningTitle}>语音调参</Text>
            <View style={styles.tuningHeaderActions}>
              <Pressable style={styles.tuningIconButton} onPress={onReset}>
                <RotateCcw size={18} color="#d8d8d8" strokeWidth={2} />
              </Pressable>
              <Pressable style={styles.tuningIconButton} onPress={onClose}>
                <X size={20} color="#d8d8d8" strokeWidth={2} />
              </Pressable>
            </View>
          </View>
          <ScrollView style={styles.tuningScroll} contentContainerStyle={styles.tuningScrollContent}>
            {groups.map((group) => (
              <View key={group.title} style={styles.tuningGroup}>
                <Text style={styles.tuningGroupTitle}>{group.title}</Text>
                {group.fields.map((field) => (
                  <TuningRow
                    key={field.key}
                    field={field}
                    value={config[field.key]}
                    onChange={(value) => onChange({ [field.key]: value } as Partial<VoiceCallTuningConfig>)}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TuningRow({
  field,
  value,
  onChange,
}: {
  field: TuningField;
  value: number;
  onChange: (value: number) => void;
}) {
  const decimals = field.decimals ?? 0;
  const formatted = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  const commitText = (text: string) => {
    const numeric = Number(text.replace(',', '.'));
    if (Number.isFinite(numeric)) {
      onChange(decimals > 0 ? Number(numeric.toFixed(decimals)) : Math.round(numeric));
    }
  };
  const adjust = (direction: -1 | 1) => {
    const next = value + direction * field.step;
    onChange(decimals > 0 ? Number(next.toFixed(decimals)) : Math.round(next));
  };

  return (
    <View style={styles.tuningRow}>
      <View style={styles.tuningLabelBlock}>
        <Text style={styles.tuningLabel} numberOfLines={1}>{field.label}</Text>
        {!!field.unit && <Text style={styles.tuningUnit}>{field.unit}</Text>}
      </View>
      <View style={styles.tuningStepper}>
        <Pressable style={styles.stepButton} onPress={() => adjust(-1)}>
          <Text style={styles.stepButtonText}>-</Text>
        </Pressable>
        <TextInput
          style={styles.tuningInput}
          value={formatted}
          keyboardType="numeric"
          selectTextOnFocus
          onChangeText={commitText}
        />
        <Pressable style={styles.stepButton} onPress={() => adjust(1)}>
          <Text style={styles.stepButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  visualBackground: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
  },
  cameraWindow: {
    position: 'absolute',
    right: 16,
    width: 112,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: '#111',
  },
  topBar: {
    paddingHorizontal: 16,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pipButton: {
    width: 42,
    height: 42,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  tuningButton: {
    width: 42,
    height: 42,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  profileSection: {
    alignItems: 'center',
    paddingTop: 24,
    gap: 10,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#3a3a3a',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 12px rgba(0,0,0,0.30)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    color: '#b8b8b8',
    fontSize: 34,
    fontWeight: '800',
  },
  nickname: {
    maxWidth: '78%',
    color: '#e0e0e0',
    fontSize: 17,
    fontWeight: '400',
  },
  duration: {
    color: '#999999',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  transcript: {
    flex: 1,
    minHeight: 0,
    marginTop: 10,
  },
  transcriptShade: {
    flex: 1,
    minHeight: 0,
  },
  transcriptShadeVisual: {
    flex: 0,
    height: '34%',
    marginTop: 'auto',
  },
  transcriptContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 16,
  },
  emptyTranscript: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTranscriptText: {
    color: '#999999',
    fontSize: 14,
    textAlign: 'center',
  },
  transcriptItem: {
    gap: 4,
  },
  transcriptBubble: {
    maxWidth: '84%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  aiTranscriptBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(20,24,30,0.72)',
    borderBottomLeftRadius: 5,
  },
  userTranscriptBubble: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(42,91,132,0.76)',
    borderBottomRightRadius: 5,
  },
  speaker: {
    color: '#888888',
    fontSize: 12,
  },
  aiSpeaker: {
    color: '#7a9ec2',
  },
  transcriptText: {
    color: '#d0d0d0',
    fontSize: 15,
    lineHeight: 24,
  },
  aiTranscriptText: {
    color: '#e0e0e0',
  },
  activeTranscriptText: {
    color: '#ffffff',
  },
  statusText: {
    textAlign: 'center',
    color: '#999999',
    fontSize: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  errorText: {
    color: '#ff8d82',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
    paddingTop: 16,
  },
  controlButton: {
    width: 86,
    alignItems: 'center',
    gap: 8,
  },
  controlDisabled: {
    opacity: 0.48,
  },
  controlCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlCircleActive: {
    backgroundColor: 'rgba(255,255,255,0.90)',
  },
  controlCircleInactive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  controlLabel: {
    width: '100%',
    color: '#999999',
    fontSize: 12,
    textAlign: 'center',
  },
  hangupButton: {
    width: 88,
    alignItems: 'center',
    gap: 8,
  },
  hangupCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e74c3c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  tuningPanel: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '82%',
    backgroundColor: '#252525',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  tuningHeader: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  tuningTitle: {
    color: '#f1f1f1',
    fontSize: 17,
    fontWeight: '700',
  },
  tuningHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tuningIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tuningScroll: {
    maxHeight: 560,
  },
  tuningScrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 18,
  },
  tuningGroup: {
    gap: 10,
  },
  tuningGroupTitle: {
    color: '#9bbfe3',
    fontSize: 13,
    fontWeight: '700',
  },
  tuningRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tuningLabelBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tuningLabel: {
    color: '#e2e2e2',
    fontSize: 14,
  },
  tuningUnit: {
    color: '#888888',
    fontSize: 11,
  },
  tuningStepper: {
    width: 156,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  stepButton: {
    width: 38,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  stepButtonText: {
    color: '#f0f0f0',
    fontSize: 20,
    fontWeight: '600',
  },
  tuningInput: {
    flex: 1,
    height: '100%',
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 4,
  },
});
