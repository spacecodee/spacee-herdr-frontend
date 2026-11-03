import { Service, signal } from '@angular/core';

export const PROMPTS_KEY = 'spacee-herdr.prompts';
export const MAX_TITLE = 60;
export const MAX_TEXT = 4000;
const VERSION = 1;

/** A saved prompt, or a command chip (same shape: a chip is a short prompt such as `/clear`). */
export interface SavedPrompt {
  id: string;
  title: string;
  text: string;
  /** Tapping sends it through the normal send path instead of putting it in the field. */
  sendNow: boolean;
}

export type PromptDraft = Omit<SavedPrompt, 'id'>;
export type PromptList = 'prompts' | 'commands';

const command = (text: string): SavedPrompt => ({ id: `cmd-${text.slice(1)}`, title: text, text, sendNow: false });
export const DEFAULT_COMMANDS: readonly SavedPrompt[] = ['/clear', '/compact', '/init', '/review'].map(command);

/** Why a draft cannot be saved, or null when it can. */
export function promptProblem(draft: PromptDraft): string | null {
  if (draft.title.trim() === '') return 'Enter a title.';
  if (draft.title.trim().length > MAX_TITLE) return `Title is ${MAX_TITLE} characters at most.`;
  if (draft.text.trim() === '') return 'Enter the prompt.';
  if (draft.text.length > MAX_TEXT) return `Prompt is ${MAX_TEXT} characters at most.`;
  return null;
}

function entries(raw: unknown): SavedPrompt[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: SavedPrompt[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, title, text, sendNow } = item as Record<string, unknown>;
    if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
    if (typeof title !== 'string' || typeof text !== 'string' || typeof sendNow !== 'boolean') continue;
    if (promptProblem({ title, text, sendNow }) !== null) continue;
    seen.add(id);
    out.push({ id, title, text, sendNow });
  }
  return out;
}

function read(): { prompts: SavedPrompt[]; commands: SavedPrompt[] } {
  const defaults = { prompts: [], commands: [...DEFAULT_COMMANDS] };
  try {
    const doc: unknown = JSON.parse(localStorage.getItem(PROMPTS_KEY) ?? 'null');
    if (typeof doc !== 'object' || doc === null) return defaults;
    const { version, prompts, commands } = doc as Record<string, unknown>;
    if (version !== VERSION) return defaults;
    return { prompts: entries(prompts) ?? [], commands: entries(commands) ?? defaults.commands };
  } catch {
    return defaults;
  }
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Saved prompts and command chips, kept in this device's localStorage (not synced). Storage
 * failures never break the session value.
 */
@Service()
export class Prompts {
  private readonly stored = read();
  private readonly list = signal(this.stored.prompts);
  private readonly chips = signal(this.stored.commands);

  /** The saved prompts, oldest first. */
  readonly prompts = this.list.asReadonly();
  /** The command chips (`/clear`, …), in the order shown. */
  readonly commands = this.chips.asReadonly();

  /** Appends a prompt (or chip); null when the draft breaks the rules. */
  add(list: PromptList, draft: PromptDraft): SavedPrompt | null {
    if (promptProblem(draft) !== null) return null;
    const entry: SavedPrompt = { id: newId(), ...clean(draft) };
    this.target(list).update((all) => [...all, entry]);
    this.persist();
    return entry;
  }

  /** Edits an entry in place, wherever it lives; false when it is unknown or the draft is invalid. */
  update(id: string, draft: PromptDraft): boolean {
    if (promptProblem(draft) !== null) return false;
    for (const list of [this.list, this.chips]) {
      if (!list().some((p) => p.id === id)) continue;
      list.update((all) => all.map((p) => (p.id === id ? { id, ...clean(draft) } : p)));
      this.persist();
      return true;
    }
    return false;
  }

  remove(id: string): void {
    this.list.update((all) => all.filter((p) => p.id !== id));
    this.chips.update((all) => all.filter((p) => p.id !== id));
    this.persist();
  }

  private target(list: PromptList) {
    return list === 'prompts' ? this.list : this.chips;
  }

  private persist(): void {
    try {
      localStorage.setItem(
        PROMPTS_KEY,
        JSON.stringify({ version: VERSION, prompts: this.list(), commands: this.chips() }),
      );
    } catch {
      // private mode or quota: the lists still apply for this session
    }
  }
}

const clean = (draft: PromptDraft): PromptDraft => ({
  title: draft.title.trim(),
  text: draft.text,
  sendNow: draft.sendNow,
});
