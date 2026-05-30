import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { formatSmartTime } from '../utils/time';

interface Props {
  timestamp: number;
}

// 聊天列表中的时间分隔：小字、居中。
// 当相邻两条消息间隔超过阈值时渲染。
export function TimeDivider({ timestamp }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.text}>{formatSmartTime(timestamp)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  text: {
    fontSize: 12,
    color: colors.textTertiary,
  },
});
