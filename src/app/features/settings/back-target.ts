/** Where the settings back link goes: `from` when it is a safe in-app path, else the list. */
export function backTarget(from: string | null): string {
  if (!from || !from.startsWith('/') || from.startsWith('//')) return '/';
  if (from.includes('\\') || /[\u0000-\u001f\u007f]/.test(from)) return '/';
  if (/^\/settings(?:[/?#]|$)/.test(from)) return '/';
  return from;
}
