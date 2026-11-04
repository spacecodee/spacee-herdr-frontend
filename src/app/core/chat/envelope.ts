/**
 * Tags the harness writes into a "user" message: a message from another agent (`hc send`), text the
 * person pasted, background-task notices, internal context and the summary after a compaction.
 * Anything else that looks like a tag (`<dir>`, `<div>`) is the person's own text.
 */
export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'agent'; from: string; text: string }
  | { kind: 'pasted'; segments: Segment[] }
  | { kind: 'notification'; summary: string }
  | { kind: 'hidden' }
  | { kind: 'compaction'; text: string };

/** What a bubble list renders: nested pasted content is flattened and hidden segments are gone. */
export type EnvelopeItem =
  | { kind: 'bubble'; text: string; from: string | undefined; pasted: boolean }
  | { kind: 'notice'; text: string }
  | { kind: 'summary'; text: string };

const OPEN = /<(hc|pasted_content|task-notification|system-reminder|user-prompt-submit-hook)\b([^>]*)>/g;
const COMPACTION = /^\s*(This session is being continued from a previous conversation|<tools-used-before-summary\b)/;
const CLOSER: Record<string, string> = {
  hc: '</hc>',
  'task-notification': '</task-notification>',
  'system-reminder': '</system-reminder>',
  'user-prompt-submit-hook': '</user-prompt-submit-hook>',
};

const tagText = (body: string, tag: string): string | null => {
  const found = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body);
  return found ? found[1].replace(/\s+/g, ' ').trim() : null;
};

/** Index and length of the closing tag of `name` at or after `from`, or null when it never closes. */
function closer(text: string, name: string, attrs: string, from: number): { at: number; length: number } | null {
  if (name === 'pasted_content') {
    // The closing tag repeats the opening tag's id, which tells nested blocks apart.
    const id = /\bid="([^"]*)"/.exec(attrs)?.[1];
    const found = new RegExp(id === undefined ? '</pasted_content\\s*>' : `</pasted_content\\s+id="${id.replace(/[^\w-]/g, '\\$&')}"\\s*>`, 'g');
    found.lastIndex = from;
    const m = found.exec(text);
    return m ? { at: m.index, length: m[0].length } : null;
  }
  const tag = CLOSER[name];
  const at = text.indexOf(tag, from);
  return at < 0 ? null : { at, length: tag.length };
}

/** The user-message text as segments. Unknown, unbalanced or unrecognised tags stay plain text. */
export function parseEnvelopes(text: string): Segment[] {
  if (COMPACTION.test(text)) return [{ kind: 'compaction', text }];
  const out: Segment[] = [];
  const plain = (s: string) => {
    const t = s.trim();
    if (t !== '') out.push({ kind: 'text', text: t });
  };
  let cursor = 0;
  OPEN.lastIndex = 0;
  for (let open = OPEN.exec(text); open; open = OPEN.exec(text)) {
    const name = open[1];
    const start = open.index + open[0].length;
    const end = closer(text, name, open[2], start);
    const from = name === 'hc' ? /\bfrom="([^"]+)"/.exec(open[2])?.[1] : undefined;
    if (!end || (name === 'hc' && !from)) continue;
    const body = text.slice(start, end.at);
    plain(text.slice(cursor, open.index));
    if (name === 'hc') out.push({ kind: 'agent', from: from as string, text: body.trim() });
    else if (name === 'pasted_content') {
      const inner = parseEnvelopes(body).flatMap((s) => (s.kind === 'pasted' ? s.segments : [s]));
      out.push({ kind: 'pasted', segments: inner });
    } else if (name === 'task-notification') {
      out.push({ kind: 'notification', summary: tagText(body, 'summary') ?? tagText(body, 'status') ?? 'finished' });
    } else out.push({ kind: 'hidden' });
    cursor = end.at + end.length;
    OPEN.lastIndex = cursor;
  }
  plain(text.slice(cursor));
  return out;
}

/** The segments as a flat list for rendering. */
export function flattenEnvelopes(segments: Segment[], pasted = false): EnvelopeItem[] {
  return segments.flatMap((s): EnvelopeItem[] => {
    switch (s.kind) {
      case 'text':
        return [{ kind: 'bubble', text: s.text, from: undefined, pasted }];
      case 'agent':
        return [{ kind: 'bubble', text: s.text, from: s.from, pasted }];
      case 'pasted':
        return flattenEnvelopes(s.segments, true);
      case 'notification':
        return [{ kind: 'notice', text: `Background task finished: ${s.summary}` }];
      case 'compaction':
        return [{ kind: 'summary', text: s.text }];
      case 'hidden':
        return [];
    }
  });
}

/** True when the person (or another agent through `hc send`) typed something: not just notices, context or a summary. */
export const hasTypedText = (text: string): boolean => flattenEnvelopes(parseEnvelopes(text)).some((i) => i.kind === 'bubble' && i.text !== '');

/** One line for lists and search: the body text, never the tags. */
export function previewText(text: string): string {
  return flattenEnvelopes(parseEnvelopes(text))
    .map((i) => (i.kind === 'bubble' ? i.text : i.kind === 'notice' ? i.text.replace('Background task finished: ', '') : 'Conversation summarized'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
