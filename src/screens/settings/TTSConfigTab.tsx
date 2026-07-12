import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSettingsPageColors } from '../../theme/colors';
import { type STTProvider, type TTSConfig, type TTSProvider, useSettingsStore } from '../../stores/settings';
import { getTTSConfigMissingMessage, isTTSConfigReady, playTTS } from '../../services/tts';
import { createSettingsStyles } from './styles';

type TTSConfigTabProps = {
  showToast: (message: string) => void;
  keyboardBottomInset: number;
};

const TTS_PROVIDERS: Array<{ key: TTSProvider; label: string }> = [
  { key: 'minimax', label: 'MiniMax' },
  { key: 'fish', label: 'Fish Audio' },
];
const MINIMAX_TTS_MODELS = ['speech-02-hd', 'speech-02-turbo', 'speech-2.8-hd'];
const FISH_TTS_MODELS = ['s2-pro', 's1'];
const FISH_TTS_FORMATS: Array<TTSConfig['fishFormat']> = ['mp3', 'wav', 'pcm'];
const STT_PROVIDERS: Array<{ key: STTProvider; label: string }> = [
  { key: 'openai', label: 'OpenAI Whisper' },
  { key: 'fish', label: 'Fish Audio' },
  { key: 'deepgram', label: 'Deepgram' },
];

export function TTSConfigTab({ showToast, keyboardBottomInset }: TTSConfigTabProps) {
  const colors = useSettingsPageColors();
  const styles = useMemo(() => createSettingsStyles(colors), [colors]);
  const { ttsConfig, sttConfig, setTTSConfig, setSTTConfig } = useSettingsStore();
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>(ttsConfig.provider);
  const [groupId, setGroupId] = useState(ttsConfig.groupId);
  const [apiKey, setApiKey] = useState(ttsConfig.apiKey);
  const [model, setModel] = useState(ttsConfig.model);
  const [voiceId, setVoiceId] = useState(ttsConfig.voiceId);
  const [speed, setSpeed] = useState(String(ttsConfig.speed));
  const [vol, setVol] = useState(String(ttsConfig.vol));
  const [pitch, setPitch] = useState(String(ttsConfig.pitch));
  const [ttsFishBaseUrl, setTtsFishBaseUrl] = useState(ttsConfig.fishBaseUrl);
  const [ttsFishApiKey, setTtsFishApiKey] = useState(ttsConfig.fishApiKey);
  const [ttsFishReferenceId, setTtsFishReferenceId] = useState(ttsConfig.fishReferenceId);
  const [ttsFishModel, setTtsFishModel] = useState(ttsConfig.fishModel);
  const [ttsFishFormat, setTtsFishFormat] = useState<TTSConfig['fishFormat']>(ttsConfig.fishFormat);
  const [ttsFishSpeed, setTtsFishSpeed] = useState(String(ttsConfig.fishSpeed));
  const [ttsFishVolume, setTtsFishVolume] = useState(String(ttsConfig.fishVolume));
  const [sttProvider, setSttProvider] = useState<STTProvider>(sttConfig.provider);
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState(sttConfig.openAiBaseUrl);
  const [openAiApiKey, setOpenAiApiKey] = useState(sttConfig.openAiApiKey);
  const [openAiModel, setOpenAiModel] = useState(sttConfig.openAiModel);
  const [sttFishBaseUrl, setSttFishBaseUrl] = useState(sttConfig.fishBaseUrl);
  const [sttFishApiKey, setSttFishApiKey] = useState(sttConfig.fishApiKey);
  const [sttFishLanguage, setSttFishLanguage] = useState(sttConfig.fishLanguage);
  const [sttFishIgnoreTimestamps, setSttFishIgnoreTimestamps] = useState(sttConfig.fishIgnoreTimestamps);
  const [deepgramBaseUrl, setDeepgramBaseUrl] = useState(sttConfig.deepgramBaseUrl);
  const [deepgramApiKey, setDeepgramApiKey] = useState(sttConfig.deepgramApiKey);
  const [deepgramModel, setDeepgramModel] = useState(sttConfig.deepgramModel);
  const [deepgramLanguage, setDeepgramLanguage] = useState(sttConfig.deepgramLanguage);
  const [testing, setTesting] = useState(false);

  function handleSave() {
    setTTSConfig({
      provider: ttsProvider,
      groupId: groupId.trim(),
      apiKey: apiKey.trim(),
      model: model.trim() || 'speech-02-hd',
      voiceId: voiceId.trim(),
      speed: parseFloat(speed) || 1,
      vol: parseFloat(vol) || 1,
      pitch: parseFloat(pitch) || 0,
      fishBaseUrl: ttsFishBaseUrl.trim() || 'https://api.fish.audio',
      fishApiKey: ttsFishApiKey.trim(),
      fishReferenceId: ttsFishReferenceId.trim(),
      fishModel: ttsFishModel.trim() || 's2-pro',
      fishFormat: ttsFishFormat,
      fishSpeed: parseFloat(ttsFishSpeed) || 1,
      fishVolume: Number.isFinite(parseFloat(ttsFishVolume)) ? parseFloat(ttsFishVolume) : 0,
    });
    setSTTConfig({
      provider: sttProvider,
      openAiBaseUrl: openAiBaseUrl.trim(),
      openAiApiKey: openAiApiKey.trim(),
      openAiModel: openAiModel.trim() || 'whisper-1',
      fishBaseUrl: sttFishBaseUrl.trim() || 'https://api.fish.audio',
      fishApiKey: sttFishApiKey.trim(),
      fishLanguage: sttFishLanguage.trim() || 'zh',
      fishIgnoreTimestamps: sttFishIgnoreTimestamps,
      deepgramBaseUrl: deepgramBaseUrl.trim() || 'https://api.deepgram.com/v1',
      deepgramApiKey: deepgramApiKey.trim(),
      deepgramModel: deepgramModel.trim() || 'nova-3',
      deepgramLanguage: deepgramLanguage.trim(),
    });
    showToast('语音配置已保存');
  }

  async function handleTest() {
    const testConfig: TTSConfig = {
        provider: ttsProvider,
        groupId: groupId.trim(),
        apiKey: apiKey.trim(),
        model: model.trim() || 'speech-02-hd',
        voiceId: voiceId.trim(),
        speed: parseFloat(speed) || 1,
        vol: parseFloat(vol) || 1,
        pitch: parseFloat(pitch) || 0,
        fishBaseUrl: ttsFishBaseUrl.trim() || 'https://api.fish.audio',
        fishApiKey: ttsFishApiKey.trim(),
        fishReferenceId: ttsFishReferenceId.trim(),
        fishModel: ttsFishModel.trim() || 's2-pro',
        fishFormat: ttsFishFormat,
        fishSpeed: parseFloat(ttsFishSpeed) || 1,
        fishVolume: Number.isFinite(parseFloat(ttsFishVolume)) ? parseFloat(ttsFishVolume) : 0,
    };
    if (!isTTSConfigReady(testConfig)) {
      Alert.alert('提示', getTTSConfigMissingMessage(testConfig));
      return;
    }
    setTesting(true);
    try {
      await playTTS('你好，这是一段语音合成测试。', testConfig);
      showToast('TTS 配置有效');
    } catch (e: any) {
      Alert.alert('播放失败', e.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: keyboardBottomInset + 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionTitle}>TTS 语音合成</Text>
      <Text style={styles.hint}>用于朗读 AI 回复、悬浮球气泡和电台语音。</Text>

      <View style={styles.field}>
        <Text style={styles.label}>服务商</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.configList}>
          {TTS_PROVIDERS.map((provider) => (
            <Pressable
              key={provider.key}
              style={[styles.configChip, provider.key === ttsProvider && styles.configChipActive]}
              onPress={() => setTtsProvider(provider.key)}
            >
              <Text style={[styles.configChipText, provider.key === ttsProvider && styles.configChipTextActive]}>
                {provider.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {ttsProvider === 'minimax' ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Group ID</Text>
            <TextInput
              style={styles.input}
              value={groupId}
              onChangeText={setGroupId}
              placeholder="MiniMax Group ID"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>API Key</Text>
            <TextInput
              style={styles.input}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="MiniMax API Key"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Voice ID</Text>
            <TextInput
              style={styles.input}
              value={voiceId}
              onChangeText={setVoiceId}
              placeholder="例如：male-qn-qingse"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>模型</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.configList}>
              {MINIMAX_TTS_MODELS.map((item) => (
                <Pressable
                  key={item}
                  style={[styles.configChip, item === model && styles.configChipActive]}
                  onPress={() => setModel(item)}
                >
                  <Text style={[styles.configChipText, item === model && styles.configChipTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>语速（0.5 ~ 2.0）</Text>
            <TextInput
              style={styles.input}
              value={speed}
              onChangeText={setSpeed}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>音量（0.1 ~ 10）</Text>
            <TextInput
              style={styles.input}
              value={vol}
              onChangeText={setVol}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>音调（-12 ~ 12）</Text>
            <TextInput
              style={styles.input}
              value={pitch}
              onChangeText={setPitch}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Fish Audio Base URL</Text>
            <TextInput
              style={styles.input}
              value={ttsFishBaseUrl}
              onChangeText={setTtsFishBaseUrl}
              placeholder="https://api.fish.audio"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Fish Audio API Key</Text>
            <TextInput
              style={styles.input}
              value={ttsFishApiKey}
              onChangeText={setTtsFishApiKey}
              placeholder="Fish Audio API Key"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Reference ID</Text>
            <TextInput
              style={styles.input}
              value={ttsFishReferenceId}
              onChangeText={setTtsFishReferenceId}
              placeholder="Fish Audio voice reference id"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>模型</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.configList}>
              {FISH_TTS_MODELS.map((item) => (
                <Pressable
                  key={item}
                  style={[styles.configChip, item === ttsFishModel && styles.configChipActive]}
                  onPress={() => setTtsFishModel(item)}
                >
                  <Text style={[styles.configChipText, item === ttsFishModel && styles.configChipTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>音频格式</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.configList}>
              {FISH_TTS_FORMATS.map((item) => (
                <Pressable
                  key={item}
                  style={[styles.configChip, item === ttsFishFormat && styles.configChipActive]}
                  onPress={() => setTtsFishFormat(item)}
                >
                  <Text style={[styles.configChipText, item === ttsFishFormat && styles.configChipTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>语速</Text>
            <TextInput
              style={styles.input}
              value={ttsFishSpeed}
              onChangeText={setTtsFishSpeed}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>音量</Text>
            <TextInput
              style={styles.input}
              value={ttsFishVolume}
              onChangeText={setTtsFishVolume}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.testButton} onPress={handleTest} disabled={testing}>
          {testing ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.testButtonText}>测试播放</Text>}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>STT 语音转文字</Text>
      <Text style={styles.hint}>长按语音按键发送语音。</Text>

      <View style={styles.field}>
        <Text style={styles.label}>服务商</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.configList}>
          {STT_PROVIDERS.map((provider) => (
            <Pressable
              key={provider.key}
              style={[styles.configChip, provider.key === sttProvider && styles.configChipActive]}
              onPress={() => setSttProvider(provider.key)}
            >
              <Text style={[styles.configChipText, provider.key === sttProvider && styles.configChipTextActive]}>
                {provider.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {sttProvider === 'openai' ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>OpenAI Base URL</Text>
            <TextInput
              style={styles.input}
              value={openAiBaseUrl}
              onChangeText={setOpenAiBaseUrl}
              placeholder="留空则使用主聊天 API Base URL"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>OpenAI API Key</Text>
            <TextInput
              style={styles.input}
              value={openAiApiKey}
              onChangeText={setOpenAiApiKey}
              placeholder="留空则使用主聊天 API Key"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>OpenAI STT 模型</Text>
            <TextInput
              style={styles.input}
              value={openAiModel}
              onChangeText={setOpenAiModel}
              placeholder="whisper-1"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </View>
        </>
      ) : sttProvider === 'fish' ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Fish Audio Base URL</Text>
            <TextInput
              style={styles.input}
              value={sttFishBaseUrl}
              onChangeText={setSttFishBaseUrl}
              placeholder="https://api.fish.audio"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Fish Audio API Key</Text>
            <TextInput
              style={styles.input}
              value={sttFishApiKey}
              onChangeText={setSttFishApiKey}
              placeholder="Fish Audio API Key"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>语言</Text>
            <TextInput
              style={styles.input}
              value={sttFishLanguage}
              onChangeText={setSttFishLanguage}
              placeholder="zh"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>时间戳</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.configList}>
              <Pressable
                style={[styles.configChip, sttFishIgnoreTimestamps && styles.configChipActive]}
                onPress={() => setSttFishIgnoreTimestamps(true)}
              >
                <Text style={[styles.configChipText, sttFishIgnoreTimestamps && styles.configChipTextActive]}>忽略时间戳</Text>
              </Pressable>
              <Pressable
                style={[styles.configChip, !sttFishIgnoreTimestamps && styles.configChipActive]}
                onPress={() => setSttFishIgnoreTimestamps(false)}
              >
                <Text style={[styles.configChipText, !sttFishIgnoreTimestamps && styles.configChipTextActive]}>返回分段</Text>
              </Pressable>
            </ScrollView>
          </View>
        </>
      ) : (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Deepgram Base URL</Text>
            <TextInput
              style={styles.input}
              value={deepgramBaseUrl}
              onChangeText={setDeepgramBaseUrl}
              placeholder="https://api.deepgram.com/v1"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Deepgram API Key</Text>
            <TextInput
              style={styles.input}
              value={deepgramApiKey}
              onChangeText={setDeepgramApiKey}
              placeholder="Deepgram API Key"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Deepgram 模型</Text>
            <TextInput
              style={styles.input}
              value={deepgramModel}
              onChangeText={setDeepgramModel}
              placeholder="nova-3"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>语言（可选）</Text>
            <TextInput
              style={styles.input}
              value={deepgramLanguage}
              onChangeText={setDeepgramLanguage}
              placeholder="例如 zh / en，留空自动识别"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </View>
        </>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>保存语音配置</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
