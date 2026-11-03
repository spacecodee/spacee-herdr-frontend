const key = (address: string) => `spacee-herdr.draft.${address}`;

/** Unsent compose text for one terminal. Storage problems read as empty. */
export function loadDraft(address: string): string {
  try {
    return localStorage.getItem(key(address)) ?? '';
  } catch {
    return '';
  }
}

/** Stores the text; empty text removes the entry. Storage problems are ignored. */
export function saveDraft(address: string, text: string): void {
  try {
    if (text === '') localStorage.removeItem(key(address));
    else localStorage.setItem(key(address), text);
  } catch {
    // private mode or quota: the draft just does not survive
  }
}

export function clearDraft(address: string): void {
  saveDraft(address, '');
}
