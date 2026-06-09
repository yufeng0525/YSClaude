import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import type { LicenseGrant } from '../stores/license';

type LicenseErrorKind = 'config' | 'device' | 'invalid' | 'network';

export class LicenseError extends Error {
  kind: LicenseErrorKind;

  constructor(kind: LicenseErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

interface LicenseServerResponse {
  ok?: boolean;
  valid?: boolean;
  authorized?: boolean;
  token?: string;
  code?: string;
  message?: string;
  error?: string;
}

function getLicenseServiceUrl(): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const endpoint = decodeEndpoint(extra?.licenseServiceEndpoint);
  const legacyUrl = typeof extra?.licenseServiceUrl === 'string' ? extra.licenseServiceUrl.trim() : '';
  const url = endpoint || legacyUrl;
  return url.replace(/\/+$/, '');
}

function decodeEndpoint(value: unknown): string {
  if (!Array.isArray(value)) return '';
  const chars = value.map((part, index) => {
    if (typeof part !== 'number' || !Number.isFinite(part)) return '';
    return String.fromCharCode((part ^ endpointMask(index)) & 0xff);
  });
  return chars.join('').trim();
}

function endpointMask(index: number): number {
  return (71 + index * 31) & 0xff;
}

function getAppVersion(): string {
  return (
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    'unknown'
  );
}

function normalizeInviteCode(value: string): string {
  return value.trim().toLowerCase();
}

export async function getStableDeviceId(): Promise<string> {
  if (Platform.OS === 'android') {
    const androidId = Application.getAndroidId();
    if (androidId) return androidId;
  }

  throw new LicenseError('device', '当前版本仅支持 Android 设备邀请码验证');
}

async function postLicense(endpoint: 'activate' | 'verify', body: Record<string, unknown>) {
  const baseUrl = getLicenseServiceUrl();
  if (!baseUrl) {
    throw new LicenseError('config', '尚未配置授权服务地址');
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LicenseError('network', '无法连接授权服务');
  }

  let data: LicenseServerResponse = {};
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  const message = data.message || data.error;
  if (!response.ok) {
    throw new LicenseError(
      response.status >= 400 && response.status < 500 ? 'invalid' : 'network',
      message || `授权服务错误 ${response.status}`
    );
  }

  const accepted = data.ok === true || data.valid === true || data.authorized === true;
  if (!accepted) {
    throw new LicenseError('invalid', message || '邀请码无效或已绑定其他设备');
  }

  return data;
}

export async function activateLicense(inviteCode: string): Promise<LicenseGrant> {
  const code = normalizeInviteCode(inviteCode);
  if (!code) {
    throw new LicenseError('invalid', '请输入邀请码');
  }

  const deviceId = await getStableDeviceId();
  const now = Date.now();
  const data = await postLicense('activate', {
    code,
    deviceId,
    platform: Platform.OS,
    appId: Application.applicationId,
    appVersion: getAppVersion(),
  });

  return {
    inviteCode: data.code || code,
    deviceId,
    token: data.token,
    activatedAt: now,
    verifiedAt: now,
  };
}

export async function verifyLicense(grant: LicenseGrant): Promise<Partial<LicenseGrant>> {
  const deviceId = await getStableDeviceId();
  if (deviceId !== grant.deviceId) {
    throw new LicenseError('invalid', '当前设备与已激活设备不一致');
  }

  const code = normalizeInviteCode(grant.inviteCode);

  const data = await postLicense('verify', {
    code,
    deviceId,
    token: grant.token,
    platform: Platform.OS,
    appId: Application.applicationId,
    appVersion: getAppVersion(),
  });

  return {
    inviteCode: code,
    deviceId,
    token: data.token || grant.token,
  };
}
