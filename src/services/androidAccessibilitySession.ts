import { readAccessibilityScreenContext } from './nativeTools';
import { buildAndroidAccessibilityScreenSummary } from '../utils/androidAccessibilityControl';

export interface PendingAndroidAccessibilityContext {
  imageUri: string | null;
  screenSummary: string;
  interactiveElements: string;
  activePackage: string;
  capturedAt: number;
}

let pendingContext: PendingAndroidAccessibilityContext | null = null;

function readActivePackage(screen: unknown): string {
  if (screen && typeof screen === 'object' && 'activePackage' in screen) {
    const value = (screen as { activePackage?: unknown }).activePackage;
    return typeof value === 'string' ? value : '';
  }
  return '';
}

export async function capturePendingAndroidAccessibilityContext(): Promise<PendingAndroidAccessibilityContext> {
  const contextText = await readAccessibilityScreenContext({ includeFullTree: true });
  const context = JSON.parse(contextText) as {
    imageUri?: string | null;
    interactiveElements?: string;
    screen?: unknown;
  };
  const nextContext: PendingAndroidAccessibilityContext = {
    imageUri: context.imageUri || null,
    screenSummary: buildAndroidAccessibilityScreenSummary(context.screen),
    interactiveElements: typeof context.interactiveElements === 'string' ? context.interactiveElements : '',
    activePackage: readActivePackage(context.screen),
    capturedAt: Date.now(),
  };
  pendingContext = nextContext;
  return nextContext;
}

export function consumePendingAndroidAccessibilityContext(): PendingAndroidAccessibilityContext | null {
  const context = pendingContext;
  pendingContext = null;
  return context;
}
