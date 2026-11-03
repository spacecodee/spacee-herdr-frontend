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
export interface QuestionOption {
  label: string;
  description?: string;
}
/** One question an agent asks (the bridge's `questions[]` of a question tool part). */
export interface AgentQuestion {
  question: string;
  header?: string;
  multiSelect?: boolean;
  /** A free-text answer is allowed besides the options. */
  other?: boolean;
  /** The answer must be hidden in this chat. */
  secret?: boolean;
  /** Empty means a free-text question. */
  options: QuestionOption[];
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
  /** Present while the agent waits (`status: running`). */
  questions?: AgentQuestion[];
  /** Once answered: question text to answer (several answers joined with ", "; secret ones masked). */
  answers?: Record<string, string>;
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
