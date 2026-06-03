import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Markdown from '@ronradtke/react-native-markdown-display';
import { lightColors, useThemeColors, type ThemeColors } from '../theme/colors';

import { fonts } from '../theme/fonts';
import { splitStickerContent } from '../utils/stickers';


let colors = lightColors;
interface Props {
  content: string;
  variant: 'user' | 'assistant';
  markdownStyle?: any;
  markdownRules?: any;
}

export function StickerContent({ content, variant, markdownStyle, markdownRules }: Props) {
  colors = useThemeColors();
  styles = useMemo(() => createStyles(colors), [colors]);

  const isUser = variant === 'user';
  const chunks = splitStickerContent(content, isUser ? 'user' : 'assistant');

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      {chunks.map((chunk, index) => {
        if (chunk.type === 'sticker') {
          return (
            <Image
              key={`sticker-${index}-${chunk.sticker.name}`}
              source={chunk.sticker.image}
              style={isUser ? styles.userSticker : styles.assistantSticker}
              resizeMode="contain"
              accessibilityLabel={`表情包：${chunk.sticker.name}`}
            />
          );
        }

        if (chunk.text.length === 0) return null;

        if (isUser) {
          return (
            <Text key={`text-${index}`} style={styles.userText}>
              {chunk.text}
            </Text>
          );
        }

        return (
          <Markdown key={`text-${index}`} style={markdownStyle} rules={markdownRules}>
            {chunk.text}
          </Markdown>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    gap: 6,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
    width: '100%',
    maxWidth: '100%',
  },
  userText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
    fontFamily: fonts.serifBold,
  },
  userSticker: {
    width: 112,
    height: 112,
  },
  assistantSticker: {
    width: 104,
    height: 104,
  },
});

let styles = createStyles(colors);
