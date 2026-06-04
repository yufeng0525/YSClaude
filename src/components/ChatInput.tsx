import React, { useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { View, TextInput, Pressable, Text, StyleSheet, Image, Modal, ScrollView, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { BlurView } from 'expo-blur';
import { lightColors, useThemeColors, type ThemeColors } from '../theme/colors';

import { useSettingsStore } from '../stores/settings';
import { USER_STICKERS } from '../utils/stickers';


let colors = lightColors;
const STICKER_PANEL_HEIGHT = Math.min(420, Dimensions.get('window').height * 0.48);

function clampNumber(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value as number));
}

interface Props {
  blurTarget?: RefObject<View | null>;
  onSend: (text: string, imageUri?: string) => void | Promise<void>;
  onTriggerResponse: () => void | Promise<void>;
  onEnableWebCruise?: () => void | Promise<void>;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  onModelPress?: () => void;
}

export function ChatInput({
  blurTarget,
  onSend,
  onTriggerResponse,
  onEnableWebCruise,
  disabled,
  isStreaming,
  onStop,
  onModelPress,
}: Props) {
  colors = useThemeColors();
  styles = useMemo(() => createStyles(colors), [colors]);
  const isDarkTheme = colors.background === '#12100D';

  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [stickerPickerVisible, setStickerPickerVisible] = useState(false);
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const shouldInvertResponseIcon = isDarkTheme && (isStreaming || !isInputFocused);
  const responseTouchStartedRef = useRef(false);
  const insets = useSafeAreaInsets();
  const { apiConfigs, activeConfigIndex, appearanceConfig } = useSettingsStore();
  const current = apiConfigs[activeConfigIndex];
  const currentModel = current?.name || current?.model || '未配置';

  const inputIconUris = appearanceConfig?.inputIconUris || {};
  const inputStyle = appearanceConfig?.inputStyle || 'default';
  const inputBackgroundImageUri = appearanceConfig?.inputBackgroundImageUri;
  const inputBackgroundTransparent = !!appearanceConfig?.inputBackgroundTransparent;
  const inputBlurIntensity = clampNumber(appearanceConfig?.inputBlurIntensity, 72, 0, 100);
  const isGlassInput = inputStyle === 'glass';
  const glassAlpha = 0.16 + (inputBlurIntensity / 100) * 0.16;
  const hasCustomInputSurface = isGlassInput || !!inputBackgroundImageUri || inputBackgroundTransparent;
  const inputPanelBackground = inputBackgroundTransparent
    ? 'transparent'
    : isGlassInput || inputBackgroundImageUri
    ? (isDarkTheme ? `rgba(26,22,18,${glassAlpha})` : `rgba(255,255,255,${glassAlpha})`)
    : colors.inputBackground;
  const inputOverlayBackground = inputBackgroundTransparent
    ? 'transparent'
    : colors.background === '#12100D'
      ? 'rgba(18,16,13,0.08)'
      : 'rgba(255,255,255,0.08)';

  const pickImage = async () => {
    setOptionsMenuVisible(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingImage(result.assets[0].uri);
    }
  };

  const handleEnableWebCruise = async () => {
    if (disabled || isStreaming) return;
    setOptionsMenuVisible(false);
    await onEnableWebCruise?.();
  };

  const handleSend = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed && !pendingImage) return;
    if (disabled) return;
    await onSend(trimmed, pendingImage || undefined);
    setText('');
    setPendingImage(null);
  };

  const handleChangeText = (next: string) => {
    if (
      next.length === text.length + 1 &&
      next.startsWith(text) &&
      next.endsWith('\n')
    ) {
      void handleSend(text);
      return;
    }
    setText(next);
  };

  const handleGetResponsePressIn = async () => {
    responseTouchStartedRef.current = true;
    if (isStreaming) {
      onStop?.();
      return;
    }
    await onTriggerResponse();
  };

  const handleGetResponsePress = async () => {
    if (responseTouchStartedRef.current) {
      responseTouchStartedRef.current = false;
      return;
    }
    if (isStreaming) {
      onStop?.();
      return;
    }
    await onTriggerResponse();
  };

  const handleSendSticker = async (token: string) => {
    if (disabled || isStreaming) return;
    setStickerPickerVisible(false);
    setText('');
    setPendingImage(null);
    await onSend(token);
  };

  const getResponseIcon = () => {
    if (isStreaming) {
      return inputIconUris.stop ? { uri: inputIconUris.stop } : require('../../assets/stopsend.png');
    }
    if (isInputFocused) {
      return inputIconUris.sendFocused ? { uri: inputIconUris.sendFocused } : require('../../assets/getresponse2.png');
    }
    return inputIconUris.sendIdle ? { uri: inputIconUris.sendIdle } : require('../../assets/getresponse1.png');
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.container, { backgroundColor: inputPanelBackground }, hasCustomInputSurface && styles.customContainer]}>
        {inputBackgroundImageUri && (
          <Image source={{ uri: inputBackgroundImageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )}
        {isGlassInput && (
          <BlurView
            blurTarget={blurTarget}
            blurMethod="dimezisBlurView"
            blurReductionFactor={1}
            intensity={inputBlurIntensity}
            tint={isDarkTheme ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        )}
        {hasCustomInputSurface && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: inputOverlayBackground }]} />
        )}
        {pendingImage && (
          <View style={styles.previewRow}>
            <View style={styles.previewWrap}>
              <Image source={{ uri: pendingImage }} style={styles.previewImage} resizeMode="cover" />
              <Pressable style={styles.previewClose} onPress={() => setPendingImage(null)}>
                <Text style={styles.previewCloseText}>✕</Text>
              </Pressable>
            </View>
          </View>
        )}
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleChangeText}
          placeholder="Reply to Claude..."
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={10000}
          editable={!disabled}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
        />
        <View style={styles.toolbar}>
          <Pressable style={styles.optionsButton} onPress={() => setOptionsMenuVisible(true)}>
            <Image
              source={inputIconUris.options ? { uri: inputIconUris.options } : require('../../assets/optionsbutton.png')}
              style={styles.optionsImage}
              resizeMode="contain"
            />
          </Pressable>

          <Pressable style={styles.modelPill} onPress={onModelPress}>
            <Text style={styles.modelText} numberOfLines={1}>{currentModel}</Text>
          </Pressable>

          <View style={styles.rightButtons}>
            <Pressable style={styles.stickerButton} onPress={() => setStickerPickerVisible(true)}>
              <Image
                source={inputIconUris.sticker ? { uri: inputIconUris.sticker } : require('../../assets/sticker.png')}
                style={styles.stickerButtonImage}
                resizeMode="contain"
              />
            </Pressable>
            <Pressable
              style={styles.sendButton}
              onPressIn={() => void handleGetResponsePressIn()}
              onPress={() => void handleGetResponsePress()}
            >
              <Image
                source={getResponseIcon()}
                style={[styles.sendImage, shouldInvertResponseIcon && styles.invertedImageIcon]}
                resizeMode="contain"
              />
            </Pressable>
          </View>
        </View>
      </View>

      <Modal transparent visible={stickerPickerVisible} animationType="fade" onRequestClose={() => setStickerPickerVisible(false)}>
        <Pressable style={styles.stickerOverlay} onPress={() => setStickerPickerVisible(false)}>
          <View style={styles.stickerPanel} onStartShouldSetResponder={() => true}>
            <ScrollView
              style={styles.stickerScroll}
              contentContainerStyle={styles.stickerGrid}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              persistentScrollbar
            >
              {USER_STICKERS.map((sticker) => (
                <Pressable
                  key={sticker.name}
                  style={styles.stickerItem}
                  onPress={() => void handleSendSticker(sticker.token)}
                >
                  <Image source={sticker.image} style={styles.stickerImage} resizeMode="contain" />
                  <Text style={styles.stickerName}>{sticker.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal transparent visible={optionsMenuVisible} animationType="fade" onRequestClose={() => setOptionsMenuVisible(false)}>
        <Pressable style={styles.optionsOverlay} onPress={() => setOptionsMenuVisible(false)}>
          <View style={styles.optionsPanel} onStartShouldSetResponder={() => true}>
            <Pressable style={styles.optionItem} onPress={() => void handleEnableWebCruise()}>
              <Text style={styles.optionText}>AI网页巡游</Text>
            </Pressable>
            <View style={styles.optionDivider} />
            <Pressable style={styles.optionItem} onPress={() => void pickImage()}>
              <Text style={styles.optionText}>图片</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  wrapper: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
    backgroundColor: 'transparent',
  },
  container: {
    backgroundColor: colors.inputBackground,
    borderRadius: 24,
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  customContainer: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  previewRow: {
    marginBottom: 8,
  },
  previewWrap: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: 72,
    height: 72,
  },
  previewClose: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCloseText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    fontSize: 16,
    color: colors.text,
    fontFamily: 'Sohne',
    maxHeight: 120,
    minHeight: 28,
    paddingVertical: 0,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  optionsButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsImage: {
    width: 28,
    height: 28,
  },
  modelPill: {
    backgroundColor: colors.surfaceHover,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
    maxWidth: 180,
  },
  modelText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  rightButtons: {
    flexDirection: 'row',
    marginLeft: 'auto',
    alignItems: 'center',
    gap: 8,
  },
  stickerButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerButtonImage: {
    width: 30,
    height: 30,
  },
  sendButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendImage: {
    width: 30,
    height: 30,
  },
  invertedImageIcon: {
    tintColor: colors.text,
  },
  stickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  stickerPanel: {
    marginHorizontal: 12,
    marginBottom: 96,
    backgroundColor: colors.inputBackground,
    borderRadius: 20,
    padding: 12,
    height: STICKER_PANEL_HEIGHT,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  stickerScroll: {
    flex: 1,
  },
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 4,
  },
  stickerItem: {
    width: '30%',
    minWidth: 86,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surfaceHover,
  },
  stickerImage: {
    width: 64,
    height: 64,
  },
  stickerName: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
  },
  optionsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  optionsPanel: {
    marginLeft: 18,
    marginBottom: 96,
    minWidth: 148,
    backgroundColor: colors.inputBackground,
    borderRadius: 14,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  optionItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  optionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.inputBorder,
    marginHorizontal: 10,
  },
});

let styles = createStyles(colors);
