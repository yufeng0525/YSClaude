import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyRound, ShieldCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightColors, useThemeColors, type ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useLicenseStore } from '../stores/license';
import {
  activateLicense,
  getStableDeviceId,
  LicenseError,
  verifyLicense,
} from '../services/license';

let colors = lightColors;

interface InviteGateProps {
  children: React.ReactNode;
}

export function InviteGate({ children }: InviteGateProps) {
  colors = useThemeColors();
  styles = useMemo(() => createStyles(colors), [colors]);

  const insets = useSafeAreaInsets();
  const hydrated = useLicenseStore((state) => state._hydrated);
  const grant = useLicenseStore((state) => state.grant);
  const setGrant = useLicenseStore((state) => state.setGrant);
  const updateVerifiedAt = useLicenseStore((state) => state.updateVerifiedAt);
  const clearGrant = useLicenseStore((state) => state.clearGrant);
  const [code, setCode] = useState('');
  const [deviceHint, setDeviceHint] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const verificationKey = grant ? `${grant.inviteCode}|${grant.deviceId}|${grant.token || ''}` : '';

  useEffect(() => {
    let canceled = false;
    getStableDeviceId()
      .then((deviceId) => {
        if (!canceled) {
          setDeviceHint(deviceId.slice(-8).toUpperCase());
        }
      })
      .catch(() => {
        if (!canceled) {
          setDeviceHint('');
        }
      });

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !grant) return;

    let canceled = false;
    verifyLicense(grant)
      .then((patch) => {
        if (canceled) return;
        updateVerifiedAt(Date.now(), patch);
      })
      .catch((error) => {
        if (canceled) return;
        if (error instanceof LicenseError && error.kind === 'invalid') {
          clearGrant();
        }
      });

    return () => {
      canceled = true;
    };
  }, [clearGrant, hydrated, updateVerifiedAt, verificationKey]);

  async function submitInviteCode() {
    const trimmed = code.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setMessage(null);
    try {
      const nextGrant = await activateLicense(trimmed);
      setGrant(nextGrant);
      setCode('');
    } catch (error) {
      if (error instanceof LicenseError) {
        setMessage(error.message);
      } else {
        setMessage('邀请码验证失败');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated && !grant) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (grant) {
    return <>{children}</>;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.brandBlock}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={styles.appName}>YSClaude</Text>
        <View style={styles.statusPill}>
          <ShieldCheck size={16} color={colors.primary} strokeWidth={2.2} />
          <Text style={styles.statusText}>Invite required</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.title}>输入邀请码</Text>
        <Text style={styles.subtitle}>
          验证后会绑定当前 Android 设备，应用更新和卸载重装后仍可继续使用。
        </Text>

        <View style={styles.inputWrap}>
          <KeyRound size={18} color={colors.textTertiary} strokeWidth={2.2} />
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.toLowerCase())}
            placeholder="INVITE-CODE"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={submitInviteCode}
            editable={!submitting}
            style={styles.input}
          />
        </View>

        {deviceHint ? (
          <Text style={styles.deviceText}>Device #{deviceHint}</Text>
        ) : (
          <Text style={styles.deviceText}>仅支持 Android 设备验证</Text>
        )}

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable
          style={[
            styles.submitButton,
            (!code.trim() || submitting) && styles.submitButtonDisabled,
          ]}
          onPress={submitInviteCode}
          disabled={!code.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <KeyRound size={18} color="#FFFFFF" strokeWidth={2.4} />
          )}
          <Text style={styles.submitText}>{submitting ? '验证中' : '验证邀请码'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    backgroundColor: colors.background,
  },
  brandBlock: {
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  appName: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.text,
    letterSpacing: 0,
  },
  statusPill: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    letterSpacing: 0,
  },
  panel: {
    gap: 14,
    marginTop: 36,
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.text,
    letterSpacing: 0,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    letterSpacing: 0,
  },
  inputWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    minHeight: 50,
    paddingVertical: 0,
    fontFamily: fonts.mono,
    fontSize: 16,
    color: colors.text,
    letterSpacing: 0,
  },
  deviceText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textTertiary,
    letterSpacing: 0,
  },
  message: {
    minHeight: 20,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
    letterSpacing: 0,
  },
  submitButton: {
    minHeight: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0,
  },
});

let styles = createStyles(colors);
