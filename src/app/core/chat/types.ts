/** Chat transcript wire types: `GET /api/chat?terminal=<address>` (SSE) from the bridge. */

export type ChatRole = 'user' | 'assistant' | 'system';
export type ToolStatus = 'running' | 'ok' | 'error';

export interface TextPart {
  type: 'text';
  text: string;
}
export interface ThinkingPart {
  type: 'thinking';
  text: string;
}
export interface ToolPart {
  type: 'tool';
  id: string;
  name: string;
  summary: string;
  input?: string;
  output?: string;
  status: ToolStatus;
  truncated?: boolean;
}
export interface ImagePart {
  type: 'image';
  path?: string;
  note?: string;
}
export type ChatPart = TextPart | ThinkingPart | ToolPart | ImagePart;

export interface ChatMessage {
  id: string;
  role: ChatRole;
  time: string | number;
  parts: ChatPart[];
  /** Typed while the agent was busy and not taken yet; a `remove` event drops it once it is. */
  queued?: boolean;
}

export type ChatState = 'connecting' | 'live' | 'none' | 'error';
export type NoneReason = 'no-agent' | 'unsupported' | 'not-found';

export interface ResetEvent {
  agent: string;
  session: string;
  messages: ChatMessage[];
}
