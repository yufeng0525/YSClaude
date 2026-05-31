import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { formatSmartTime } from '../utils/time';

interface Props {
  timestamp: number;
  onDelete?: () => void;
}

export function TimeDivider({ timestamp, onDelete }: Props) {
  const handleLongPress = () => {
    if (!onDelete) return;
    Alert.alert('删除', '确定删除该时间标记？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Pressable onLongPress={handleLongPress} style={styles.row}>
      <Text style={styles.text}>{formatSmartTime(timestamp)}</Text>
    </Pressable>
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
