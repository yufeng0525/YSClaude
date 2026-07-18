import * as Font from 'expo-font';

export const INTER_MEDIUM = 'InterMedium';

export async function ensureInterfaceFontsLoaded(): Promise<void> {
  if (Font.isLoaded(INTER_MEDIUM)) return;
  await Font.loadAsync({
    [INTER_MEDIUM]: require('../../assets/Inter-Medium-8.otf'),
  });
}
