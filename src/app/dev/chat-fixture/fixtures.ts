import type { ChatMessage } from '../../core/chat/types';

const at = 1_760_000_000_000;

export const CONVERSATION: ChatMessage[] = [
  { id: 'u0', role: 'user', time: at - 1000, parts: [{ type: 'text', text: '/model opus' }] },
  {
    id: 'u1',
    role: 'user',
    time: at,
    parts: [{ type: 'text', text: 'Why does the reconnect loop never stop after the tab resumes?' }],
  },
  {
    id: 'a1',
    role: 'assistant',
    time: at + 1000,
    parts: [
      { type: 'thinking', text: 'The probe fires on visibilitychange, but the backoff timer is never cleared on success.' },
      { type: 'tool', id: 't1', name: 'Grep', summary: 'Grep "backoff" in src/app/core/hc', input: 'pattern: backoff\npath: src/app/core/hc', output: 'hc-client.ts:88: this.backoff.next()\nbackoff.ts:12: export function nextDelay', status: 'ok' },
      { type: 'tool', id: 't2', name: 'Read', summary: 'Read hc-client.ts (lines 70-120)', input: 'src/app/core/hc/hc-client.ts', output: 'private scheduleReconnect() {\n  clearTimeout(this.timer);\n  ...', status: 'ok' },
      {
        type: 'text',
        text: "Found it. The **timer is cleared** only on `close()`, not after a successful `open`.\n\n## Fix\n\n```ts\nprivate onOpen(): void {\n  clearTimeout(this.reconnectTimer);\n  this.attempt = 0;\n}\n```\n\nBehaviour per state:\n\n| State | Timer | Attempt |\n|---|---|---|\n| open | cleared | reset to 0 |\n| closed | running | +1 |\n| hidden | paused | kept |\n\n- Keeps the existing backoff\n- Adds one regression test\n\nSee [the docs](https://example.com/docs) and [bad](javascript:alert(1)).",
      },
    ],
  },
  { id: 'u2', role: 'user', time: at + 5000, parts: [{ type: 'text', text: 'Apply it and run the tests.' }] },
  {
    id: 'a2',
    role: 'assistant',
    time: at + 6000,
    parts: [
      { type: 'tool', id: 't3', name: 'Edit', summary: 'Edit hc-client.ts', input: '- this.attempt++\n+ this.attempt = 0', output: 'Applied 1 edit', status: 'ok' },
      { type: 'tool', id: 't4', name: 'Bash', summary: 'pnpm test', input: 'pnpm test', output: ' FAIL  hc-client.spec.ts\n  AssertionError: expected 3 to be 0\n    at hc-client.spec.ts:210:21', status: 'error', truncated: true },
      { type: 'tool', id: 't5', name: 'Bash', summary: 'pnpm test --watch=false', input: 'pnpm test --watch=false', status: 'running' },
      { type: 'image', path: '/home/user/uploads/screenshot-1.png' },
    ],
  },
  { id: 's1', role: 'system', time: at + 7000, parts: [{ type: 'text', text: 'Context compacted' }] },
];

const ASK = {
  type: 'tool' as const,
  id: 'ask-1',
  name: 'AskUserQuestion',
  summary: 'Asked 3 questions',
  status: 'running' as const,
};
const approach = {
  question: 'Which architecture should I use for the usage module?',
  header: 'Approach',
  other: true,
  options: [
    { label: 'Hexagonal', description: 'Keeps quota parsing behind a port so providers can change.' },
    { label: 'Feature folders', description: 'Everything for usage in one folder; simplest to follow.' },
    { label: 'Keep it in core/session', description: 'No new folder; fewest files to review.' },
  ],
};
const scope = {
  question: 'Which parts should the change cover?',
  header: 'Scope',
  multiSelect: true,
  other: true,
  options: [
    { label: 'API', description: 'New /api/usage endpoint on the bridge.' },
    { label: 'Tests', description: 'Unit tests for parsing and the pace math.' },
    { label: 'Docs', description: 'README section and changelog line.' },
    { label: 'Migration', description: 'Move old cached values to the new key.' },
  ],
};
const flag = { question: 'What should the feature flag be called?', header: 'Name', other: true, options: [] };
const secret = { question: 'Paste the deploy key for acme-api.', header: 'Key', secret: true, other: true, options: [] };

const intro: ChatMessage[] = [
  { id: 'qu', role: 'user', time: at, parts: [{ type: 'text', text: 'Make the settings page use the new tokens' }] },
  { id: 'qa', role: 'assistant', time: at + 1, parts: [{ type: 'text', text: 'I will update the colors first, then the spacing. Two files need to change.' }, { type: 'tool', id: 'qt', name: 'Bash', summary: 'Ran 3 commands', input: 'ls', output: 'ok', status: 'ok' }] },
];
const ask = (text: string, part: Record<string, unknown>): ChatMessage[] => [
  ...intro,
  { id: 'q1', role: 'assistant', time: at + 2, parts: [{ type: 'text', text }, { ...ASK, ...part } as ChatMessage['parts'][number]] },
];

/** Dev-only question scenarios (`/dev/chat?s=q-...`). */
export const QUESTIONS: Record<string, ChatMessage[]> = {
  'q-single': ask('Before I start, I have a question for you.', { questions: [approach] }),
  'q-multi': ask('Before I start, I have a question for you.', { questions: [{ ...scope, other: true }] }),
  'q-steps': ask('Before I start, I have 3 questions for you.', { questions: [approach, scope, secret] }),
  'q-steps2': ask('Before I start, I have 2 questions for you.', { questions: [approach, scope] }),
  'q-free': ask('Before I start, I have a question for you.', { questions: [flag] }),
  'q-secret': ask('Before I start, I have a question for you.', { questions: [secret] }),
  'q-fallback': ask('Before I start, I have a question for you.', { questions: [approach], truncated: true }),
  'q-answered': ask('Before I start, I have 3 questions for you.', {
    questions: [approach, scope, secret],
    status: 'ok',
    answers: { [approach.question]: 'Hexagonal', [scope.question]: 'API, Tests, CI config', [secret.question]: '••••••' },
  }),
};
