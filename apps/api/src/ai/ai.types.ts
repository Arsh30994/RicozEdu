export type AiSource = {
  documentId: string;
  title: string;
  chunkId: string;
  ordinal: number;
  excerpt: string;
};

export type AiToolTrace = {
  name: 'knowledge_search' | 'degree_progress' | 'registration_eligibility';
  status: 'completed' | 'skipped' | 'failed';
  summary: string;
};

export type AiAnswer = {
  conversationId: string;
  messageId: string;
  answer: string;
  mode: 'grounded' | 'evidence-only';
  sources: AiSource[];
  tools: AiToolTrace[];
};

export type AiRequestContext = {
  tenantId: string;
  userId: string;
  membershipId: string;
  authorizationVersion: number;
  correlationId: string;
};

export type AiStreamSink = {
  send(event: 'meta' | 'delta' | 'done' | 'error', data: unknown): void;
};

export type AiHistoryTurn = { role: 'user' | 'assistant'; content: string };
