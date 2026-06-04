import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { lightColors, useThemeColors, type ThemeColors } from '../src/theme/colors';
import { fonts } from '../src/theme/fonts';

let colors = lightColors;

export default function M5StackConfigScreen() {
  colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>M5Stack</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <View style={styles.hero}>
          <Image source={require('../assets/clawd.png')} style={styles.heroIcon} resizeMode="contain" />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Clawd 设备连接</Text>
            <Text style={styles.heroSubtitle}>硬件配置入口已就位，连接能力会在这里继续扩展。</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>连接状态</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>设备</Text>
          <Text style={styles.infoValue}>未连接</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>通道</Text>
          <Text style={styles.infoValue}>待配置</Text>
        </View>

        <Text style={styles.sectionTitle}>预留配置</Text>
        <View style={styles.placeholderBox}>
          <Text style={styles.placeholderText}>
            后续可在这里加入 BLE、Wi-Fi、串口、设备名称、固件版本和测试消息等配置项。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  backIcon: {
    fontSize: 28,
    lineHeight: 30,
    color: colors.text,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.text,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 20,
    paddingBottom: 32,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
  },
  heroIcon: {
    width: 56,
    height: 56,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  placeholderBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
  },
  placeholderText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});
