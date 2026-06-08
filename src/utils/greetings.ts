export const DEFAULT_GREETING = 'What shall we think through?';

export function normalizeCustomGreetings(value?: string): string[] {
  return (value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function pickGreeting(customGreetings?: string): string {
  const pool = normalizeCustomGreetings(customGreetings);
  if (pool.length === 0) return DEFAULT_GREETING;
  return pool[Math.floor(Math.random() * pool.length)];
}
