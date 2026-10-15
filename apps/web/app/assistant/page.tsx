'use client';

import Link from 'next/link';
import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { api, loadSession } from '../../lib/api';

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

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const LAST_CONVERSATION_KEY = 'ricozedu.ai.lastConversation';
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

function conversationStorageKey(email: string, tenantId: string) {
  return `${LAST_CONVERSATION_KEY}:${encodeURIComponent(email)}:${tenantId}`;
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [question, setQuestion] = useState('');
  const [speechPreview, setSpeechPreview] = useState('');
  const [agent, setAgent] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draggingFile, setDraggingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const speechBase = useRef('');

  async function refreshSidebar() {
    const [docs, chats] = await Promise.all([
      api<DocumentInfo[]>('/v1/ai/documents'),
      api<Conversation[]>('/v1/ai/conversations'),
    ]);
    setDocuments(docs);
    setConversations(chats);
    return chats;
  }

  useEffect(() => {
    const session = loadSession();
    if (!session?.accessToken) return;
    setHasSession(true);
    void (async () => {
      try {
        const chats = await refreshSidebar();
        const savedConversation = window.localStorage.getItem(conversationStorageKey(session.email, session.tenantId));
        if (savedConversation && chats.some((chat) => chat.id === savedConversation)) {
          await openConversation(savedConversation);
        }
      } catch (reason) {
        setError(readError(reason));
      }
    })();
    return () => {
      recognition.current?.abort();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function ask(event?: FormEvent, nextQuestion = question) {
    event?.preventDefault();
    const message = nextQuestion.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    const optimisticMessageId = `local-${Date.now()}`;
    setMessages((current) => [...current, { id: optimisticMessageId, role: 'user', content: message }]);
    setQuestion('');
    setSpeechPreview('');
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
      const session = loadSession();
      if (session) {
        window.localStorage.setItem(conversationStorageKey(session.email, session.tenantId), answer.conversationId);
      }
      setMessages((current) => [...current, {
        id: answer.messageId,
        role: 'assistant',
        content: answer.answer,
        mode: answer.mode,
        sources: answer.sources,
        tools: answer.tools,
      }]);
      void refreshSidebar().catch((reason: unknown) => setError(readError(reason)));
    } catch (reason) {
      setError(readError(reason));
      setMessages((current) => current.filter((item) => item.id !== optimisticMessageId));
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
      const session = loadSession();
      if (session) {
        window.localStorage.setItem(conversationStorageKey(session.email, session.tenantId), result.id);
      }
    } catch (reason) {
      setError(readError(reason));
    }
  }

  function validateUpload(file: File) {
    const extension = file.name.toLowerCase().split('.').pop();
    if (!['pdf', 'txt', 'md', 'markdown'].includes(extension ?? '')) {
      return 'Choose a PDF, TXT, or Markdown file.';
    }
    if (!file.size || file.size > MAX_UPLOAD_SIZE) {
      return 'Files must be between 1 byte and 10 MB.';
    }
    return null;
  }

  function selectUpload(file: File | undefined) {
    if (!file) return;
    const validationError = validateUpload(file);
    setError(validationError);
    setSelectedFile(validationError ? null : file);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectUpload(event.currentTarget.files?.[0]);
  }

  function onFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingFile(false);
    selectUpload(event.dataTransfer.files[0]);
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setError('Choose or drop a document before uploading.');
      return;
    }
    const validationError = validateUpload(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const data = new FormData();
      data.append('file', selectedFile);
      await api('/v1/ai/documents/upload', { method: 'POST', body: data });
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await refreshSidebar();
    } catch (reason) {
      setError(readError(reason));
    } finally {
      setUploading(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      if (recognition.current) {
        recognition.current.stop();
        return;
      }
      recorder.current?.stop();
      return;
    }
    setError(null);
    const speechApi = window as SpeechWindow;
    const SpeechRecognitionConstructor = speechApi.SpeechRecognition ?? speechApi.webkitSpeechRecognition;
    if (SpeechRecognitionConstructor) {
      try {
        const nextRecognition = new SpeechRecognitionConstructor();
        nextRecognition.continuous = true;
        nextRecognition.interimResults = true;
        nextRecognition.lang = navigator.language || 'en-US';
        nextRecognition.onresult = (event) => {
          const results = Array.from(event.results);
          const finalText = results.filter((result) => result.isFinal).map((result) => result[0].transcript).join(' ').trim();
          const interimText = results.filter((result) => !result.isFinal).map((result) => result[0].transcript).join(' ').trim();
          const preview = [finalText, interimText].filter(Boolean).join(' ');
          setSpeechPreview(preview);
          setQuestion([speechBase.current, preview].filter(Boolean).join(' '));
        };
        nextRecognition.onerror = (event) => {
          setRecording(false);
          setError(event.error === 'not-allowed'
            ? 'Microphone permission was not granted. Allow microphone access and try again.'
            : `Voice recognition stopped (${event.error}). You can still type your question.`);
        };
        nextRecognition.onend = () => {
          setRecording(false);
          recognition.current = null;
        };
        speechBase.current = question.trim();
        recognition.current = nextRecognition;
        nextRecognition.start();
        setSpeechPreview('');
        setRecording(true);
        return;
      } catch {
        recognition.current = null;
        setError('Voice recognition could not start. Check microphone access or type your question.');
        return;
      }
    }
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

  function startNewConversation() {
    setConversationId(undefined);
    setMessages([]);
    setSpeechPreview('');
    const session = loadSession();
    if (session) {
      window.localStorage.removeItem(conversationStorageKey(session.email, session.tenantId));
    }
  }

  return (
    <section className="ai-workspace">
      <aside className="ai-sidepanel" aria-label="Ricoz AI resources">
        <button className="btn-primary ai-new-chat" type="button" onClick={startNewConversation}>
          + New conversation
        </button>
        <div className="ai-side-heading">Conversations</div>
        <div className="ai-conversation-list">
          {hasSession && conversations.length ? conversations.map((chat) => (
            <button key={chat.id} type="button" onClick={() => void openConversation(chat.id)} className={chat.id === conversationId ? 'active' : ''}>
              {chat.title}
            </button>
          )) : <p className="muted">{hasSession ? 'Your conversations will appear here.' : 'Sign in to save and revisit conversations.'}</p>}
        </div>

        <div className="ai-side-heading">Approved knowledge</div>
        <form onSubmit={uploadDocument} className="ai-upload-form">
          <div
            className={`ai-dropzone${draggingFile ? ' dragging' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setDraggingFile(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFile(false);
            }}
            onDrop={onFileDrop}
          >
            <label htmlFor="knowledge-file">{selectedFile ? selectedFile.name : 'Drop a file here or choose one'}</label>
            <span>PDF, TXT, or Markdown · up to 10 MB</span>
            <input
              ref={fileInput}
              id="knowledge-file"
              name="document"
              type="file"
              accept=".pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf"
              onChange={onFileChange}
              disabled={!hasSession || uploading}
            />
          </div>
          <button type="submit" className="btn-secondary" disabled={!hasSession || uploading || !selectedFile}>
            {uploading ? 'Uploading…' : selectedFile ? 'Upload document' : 'Choose a document first'}
          </button>
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
          {!hasSession ? (
            <div className="ai-auth-notice" role="status">
              <strong>Sign in to use Ricoz AI</strong>
              <span>Uploads and saved chat history require an authenticated account.</span>
              <Link href="/login" className="btn-primary">Sign in</Link>
            </div>
          ) : null}
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
          {speechPreview ? (
            <article className="ai-message user ai-live-transcript">
              <div className="ai-message-label">{recording ? 'You · listening' : 'You · transcript ready'}</div>
              <p>{speechPreview}</p>
            </article>
          ) : null}
          {sending ? <div className="ai-thinking"><span />Ricoz AI is checking approved evidence…</div> : null}
        </div>

        <form className="ai-composer" onSubmit={(event) => void ask(event)}>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about a course, policy, or approved document…" maxLength={4000} rows={3} />
          <div className="ai-composer-actions">
            <button type="button" className={recording ? 'voice-recording' : 'voice-button'} onClick={() => void toggleRecording()} aria-pressed={recording}>
              {recording ? '■ Stop recording' : '◉ Ask by voice'}
            </button>
            <button type="submit" className="btn-primary" disabled={!hasSession || sending || !question.trim()}>{sending ? 'Thinking…' : 'Send question'}</button>
          </div>
        </form>
        {error ? <p className="error ai-error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}

function readError(reason: unknown) {
  if (!(reason instanceof Error)) return 'Something went wrong. Please try again.';
  if (reason.message.toLowerCase().includes('missing bearer token')) {
    return 'Your session is not signed in. Sign in to upload files and save conversation history.';
  }
  return reason.message;
}
