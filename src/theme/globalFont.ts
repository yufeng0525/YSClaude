import * as Font from 'expo-font';
import { Text, TextInput } from 'react-native';
import { fonts } from './fonts';

export const GLOBAL_FONT_FAMILY = 'YSClaudeGlobalFont';

type ComponentWithDefaultProps = {
  defaultProps?: { style?: unknown };
};

let loadedFontUri: string | undefined | null = null;
const textBaseDefaultProps = (Text as unknown as ComponentWithDefaultProps).defaultProps;
const textInputBaseDefaultProps = (TextInput as unknown as ComponentWithDefaultProps).defaultProps;

function setComponentDefaultFont(
  component: ComponentWithDefaultProps,
  baseDefaultProps: ComponentWithDefaultProps['defaultProps'],
  fontFamily?: string
) {
  const current = baseDefaultProps || {};
  component.defaultProps = {
    ...current,
    style: fontFamily ? [current.style, { fontFamily }] : current.style,
  };
}

function setExportedFonts(fontFamily?: string) {
  fonts.regular = fontFamily;
  fonts.bold = fontFamily;
  fonts.serif = fontFamily;
  fonts.serifBold = fontFamily;
  fonts.serifStrong = fontFamily;
}

export async function applyGlobalFont(uri?: string): Promise<void> {
  if (loadedFontUri === uri) return;

  if (Font.isLoaded(GLOBAL_FONT_FAMILY)) {
    await Font.unloadAsync(GLOBAL_FONT_FAMILY);
  }
  loadedFontUri = null;

  if (uri) {
    await Font.loadAsync({ [GLOBAL_FONT_FAMILY]: uri });
    setExportedFonts(GLOBAL_FONT_FAMILY);
    setComponentDefaultFont(Text as unknown as ComponentWithDefaultProps, textBaseDefaultProps, GLOBAL_FONT_FAMILY);
    setComponentDefaultFont(TextInput as unknown as ComponentWithDefaultProps, textInputBaseDefaultProps, GLOBAL_FONT_FAMILY);
  } else {
    setExportedFonts(undefined);
    setComponentDefaultFont(Text as unknown as ComponentWithDefaultProps, textBaseDefaultProps);
    setComponentDefaultFont(TextInput as unknown as ComponentWithDefaultProps, textInputBaseDefaultProps);
  }

  loadedFontUri = uri;
}
