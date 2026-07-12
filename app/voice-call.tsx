import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Mic,
  MicOff,
  PhoneOff,
  PictureInPicture2,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import { useSettingsStore } from '../src/stores/settings';
import { useVoiceCallStore } from '../src/stores/voiceCall';

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
  const [durationText, setDurationText] = useState('00:00');
  const snapshot = useVoiceCallStore((state) => state.snapshot);
  const starting = useVoiceCallStore((state) => state.starting);
  const startCall = useVoiceCallStore((state) => state.startCall);
  const stopCall = useVoiceCallStore((state) => state.stopCall);
  const setMicrophoneEnabled = useVoiceCallStore((state) => state.setMicrophoneEnabled);
  const setSpeakerphoneOn = useVoiceCallStore((state) => state.setSpeakerphoneOn);
  const minimizeToFloatingBall = useVoiceCallStore((state) => state.minimizeToFloatingBall);
  const restoreFromFloatingBall = useVoiceCallStore((state) => state.restoreFromFloatingBall);
  const appearanceConfig = useSettingsStore((state) => state.appearanceConfig);
  const assistantName = (appearanceConfig?.assistantDisplayName || 'Claude').trim() || 'Claude';
  const assistantAvatarUri = appearanceConfig?.assistantAvatarImageUri;

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
      await minimizeToFloatingBall(durationText);
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

      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.pipButton} onPress={handleMinimize} disabled={!snapshot.active}>
          <PictureInPicture2 size={27} color="rgba(255,255,255,0.78)" strokeWidth={1.7} />
        </Pressable>
      </View>

      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          {assistantAvatarUri ? (
            <Image source={{ uri: assistantAvatarUri }} style={styles.avatarImage} resizeMode="cover" />
          ) : (
            <Text style={styles.avatarFallback}>AI</Text>
          )}
        </View>
        <Text style={styles.nickname} numberOfLines={1}>{assistantName}</Text>
        <Text style={styles.duration}>{durationText}</Text>
      </View>

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
              <View key={item.id} style={styles.transcriptItem}>
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
        <Pressable style={styles.hangupButton} onPress={snapshot.active ? handleHangup : handleStart} disabled={starting}>
          <View style={styles.hangupCircle}>
            {starting ? <ActivityIndicator color="#FFFFFF" /> : <PhoneOff size={32} color="#FFFFFF" strokeWidth={2.4} />}
          </View>
          <Text style={styles.controlLabel}>{snapshot.active ? '挂断' : '开始'}</Text>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  topBar: {
    paddingHorizontal: 16,
    minHeight: 56,
    justifyContent: 'center',
  },
  pipButton: {
    width: 42,
    height: 42,
    alignItems: 'flex-start',
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
});

