'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

type Source = { documentId: string; title: string; chunkId: string; ordinal: number; excerpt: string };
type Tool = { name: string; status: 'completed' | 'skipped' | 'failed'; summary: string };
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  tools?: Tool[];
  mode?: 'grounded' | 'evidence-only';
};
type Conversation = { id: string; title: string; updated_at: string };
type DocumentInfo = { id: string; title: string; source_type: string; status: string; created_at: string; chunkCount: number };

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [question, setQuestion] = useState('');
  const [agent, setAgent] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);

  async function refreshSidebar() {
    const [docs, chats] = await Promise.all([
      api<DocumentInfo[]>('/v1/ai/documents'),
      api<Conversation[]>('/v1/ai/conversations'),
    ]);
    setDocuments(docs);
    setConversations(chats);
  }

  useEffect(() => {
    void refreshSidebar().catch((reason: unknown) => setError(readError(reason)));
    return () => stream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function ask(event?: FormEvent, nextQuestion = question) {
    event?.preventDefault();
    const message = nextQuestion.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    setMessages((current) => [...current, { id: `local-${Date.now()}`, role: 'user', content: message }]);
    setQuestion('');
    try {
      const answer = await api<{
        conversationId: string;
        messageId: string;
        answer: string;
        mode: 'grounded' | 'evidence-only';
        sources: Source[];
        tools: Tool[];
      }>('/v1/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message, conversationId, agent }),
      });
      setConversationId(answer.conversationId);
      setMessages((current) => [...current, {
        id: answer.messageId,
        role: 'assistant',
        content: answer.answer,
        mode: answer.mode,
        sources: answer.sources,
        tools: answer.tools,
      }]);
      void refreshSidebar();
    } catch (reason) {
      setError(readError(reason));
      setMessages((current) => current.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  async function openConversation(id: string) {
    setError(null);
    try {
      const result = await api<{ id: string; messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; sources_json: Source[]; tool_trace_json: Tool[] }> }>(`/v1/ai/conversations/${id}`);
      setConversationId(result.id);
      setMessages(result.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        sources: message.sources_json,
        tools: message.tool_trace_json,
      })));
    } catch (reason) {
      setError(readError(reason));
    }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem('document') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const data = new FormData();
      data.append('file', file);
      await api('/v1/ai/documents/upload', { method: 'POST', body: data });
      form.reset();
      await refreshSidebar();
    } catch (reason) {
      setError(readError(reason));
    } finally {
      setUploading(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const nextRecorder = new MediaRecorder(stream.current, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined });
      nextRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      nextRecorder.onstop = async () => {
        setRecording(false);
        stream.current?.getTracks().forEach((track) => track.stop());
        if (!chunks.length) return;
        const data = new FormData();
        data.append('audio', new Blob(chunks, { type: nextRecorder.mimeType || 'audio/webm' }), 'ricoz-question.webm');
        try {
          const result = await api<{ transcript: string }>('/v1/ai/transcribe', { method: 'POST', body: data });
          setQuestion(result.transcript);
        } catch (reason) {
          setError(`${readError(reason)} You can still type your question.`);
        }
      };
      recorder.current = nextRecorder;
      nextRecorder.start();
      setRecording(true);
    } catch {
      setError('Microphone permission was not granted. You can still type your question.');
    }
  }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) {
      setError('Audio playback is not supported by this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  return (
    <section className="ai-workspace">
      <aside className="ai-sidepanel" aria-label="Ricoz AI resources">
        <button className="btn-primary ai-new-chat" type="button" onClick={() => { setConversationId(undefined); setMessages([]); }}>
          + New conversation
        </button>
        <div className="ai-side-heading">Conversations</div>
        <div className="ai-conversation-list">
          {conversations.length ? conversations.map((chat) => (
            <button key={chat.id} type="button" onClick={() => void openConversation(chat.id)} className={chat.id === conversationId ? 'active' : ''}>
              {chat.title}
            </button>
          )) : <p className="muted">Your conversations will appear here.</p>}
        </div>

        <div className="ai-side-heading">Approved knowledge</div>
        <form onSubmit={uploadDocument} className="ai-upload-form">
          <label htmlFor="knowledge-file">PDF, TXT, or Markdown</label>
          <input id="knowledge-file" name="document" type="file" accept=".pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf" />
          <button type="submit" className="btn-secondary" disabled={uploading}>{uploading ? 'Uploading…' : 'Add document'}</button>
        </form>
        <div className="ai-document-list">
          {documents.map((document) => <div key={document.id}><strong>{document.title}</strong><span>{document.chunkCount} source excerpts</span></div>)}
          {!documents.length ? <p className="muted">Upload approved course material to ground answers.</p> : null}
        </div>
      </aside>

      <div className="ai-chat-area">
        <header className="ai-chat-header">
          <div>
            <span className="eyebrow">Ricoz AI</span>
            <h1>Your grounded academic assistant</h1>
            <p>Answers cite approved documents and can use your existing academic rules—never made-up policies.</p>
          </div>
          <label className="ai-agent-toggle">
            <input type="checkbox" checked={agent} onChange={(event) => setAgent(event.target.checked)} />
            <span><strong>Academic agent</strong><small>Use read-only progress and eligibility tools when IDs are supplied.</small></span>
          </label>
        </header>

        <div className="ai-message-list" aria-live="polite">
          {!messages.length ? (
            <div className="ai-welcome">
              <span className="ai-sparkle">✦</span>
              <h2>Ask about your approved material</h2>
              <p>Try “Summarise the attendance policy” after uploading an approved document, or turn on Academic agent to explain an authorised degree-progress result.</p>
            </div>
          ) : messages.map((message) => (
            <article key={message.id} className={`ai-message ${message.role}`}>
              <div className="ai-message-label">{message.role === 'assistant' ? 'Ricoz AI' : 'You'}</div>
              <p>{message.content}</p>
              {message.role === 'assistant' ? (
                <div className="ai-message-actions">
                  <button type="button" onClick={() => speak(message.content)}>Listen</button>
                  {message.mode === 'evidence-only' ? <span className="evidence-badge">Evidence-only</span> : <span className="grounded-badge">Grounded answer</span>}
                </div>
              ) : null}
              {message.sources?.length ? <div className="ai-citations">{message.sources.map((source) => <span key={source.chunkId}>Source: {source.title} · excerpt {source.ordinal + 1}</span>)}</div> : null}
              {message.tools?.length ? <div className="ai-tools">{message.tools.map((tool) => <span key={tool.name} className={tool.status}>{tool.name.replace(/_/g, ' ')} · {tool.status}</span>)}</div> : null}
            </article>
          ))}
          {sending ? <div className="ai-thinking"><span />Ricoz AI is checking approved evidence…</div> : null}
        </div>

        <form className="ai-composer" onSubmit={(event) => void ask(event)}>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about a course, policy, or approved document…" maxLength={4000} rows={3} />
          <div className="ai-composer-actions">
            <button type="button" className={recording ? 'voice-recording' : 'voice-button'} onClick={() => void toggleRecording()} aria-pressed={recording}>
              {recording ? '■ Stop recording' : '◉ Ask by voice'}
            </button>
            <button type="submit" className="btn-primary" disabled={sending || !question.trim()}>{sending ? 'Thinking…' : 'Send question'}</button>
          </div>
        </form>
        {error ? <p className="error ai-error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}

function readError(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Something went wrong. Please try again.';
}
