import type { ChatMessage } from '../../core/chat/types';

const at = 1_760_000_000_000;

export const CONVERSATION: ChatMessage[] = [
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
