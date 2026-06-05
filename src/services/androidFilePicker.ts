import { NativeModules, Platform } from 'react-native';

export interface AndroidPickedFile {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
}

export interface AndroidPickedDirectory {
  uri: string;
  name: string;
}

interface AndroidFilePickerModule {
  pickReadingBook: () => Promise<AndroidPickedFile | null>;
  pickPhoneAgentFile?: () => Promise<AndroidPickedFile | null>;
  pickPhoneAgentDirectory?: () => Promise<AndroidPickedDirectory | null>;
}

const nativeModule = NativeModules.AndroidFilePicker as AndroidFilePickerModule | undefined;

export async function pickAndroidReadingBookFile(): Promise<AndroidPickedFile | null> {
  if (Platform.OS !== 'android' || !nativeModule?.pickReadingBook) {
    return null;
  }

  return nativeModule.pickReadingBook();
}

export async function pickAndroidPhoneAgentFile(): Promise<AndroidPickedFile | null> {
  if (Platform.OS !== 'android' || !nativeModule?.pickPhoneAgentFile) {
    return null;
  }

  return nativeModule.pickPhoneAgentFile();
}

export async function pickAndroidPhoneAgentDirectory(): Promise<AndroidPickedDirectory | null> {
  if (Platform.OS !== 'android' || !nativeModule?.pickPhoneAgentDirectory) {
    return null;
  }

  return nativeModule.pickPhoneAgentDirectory();
}
