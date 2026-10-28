'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import type { SessionStatus, WebSession as WebSessionInstance } from '@omnidim-ai/client';
import { Markdown } from '../../components/Markdown';
import { api, apiStream, loadSession } from '../../lib/api';

type Source = { documentId: string; title: string; chunkId: string; ordinal: number; excerpt: string };
type Tool = { name: string; status: 'completed' | 'skipped' | 'failed'; summary: string };
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  tools?: Tool[];
  mode?: 'grounded' | 'evidence-only';
  streaming?: boolean;
  failed?: boolean;
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
const MAX_UPLOAD_COUNT = 8;

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
  const [voiceLiveTranscript, setVoiceLiveTranscript] = useState<{ role: 'user' | 'agent'; text: string } | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'connecting' | 'active'>('idle');
  const [agent, setAgent] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draggingFile, setDraggingFile] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamRequestId = useRef(0);
  const messageList = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const voiceSession = useRef<WebSessionInstance | null>(null);
  const voiceTranscriptWrites = useRef<Promise<void>>(Promise.resolve());
  const speechBase = useRef('');
  const sessionReady = useRef(false);
  const uploadFilesRef = useRef<(files: File[]) => Promise<void>>(async () => {});
  sessionReady.current = hasSession;

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
      streamRequestId.current += 1;
      abortRef.current?.abort();
      recognition.current?.abort();
      voiceSession.current?.stop();
      window.speechSynthesis?.cancel();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function rememberConversation(id: string) {
    const session = loadSession();
    if (session) {
      window.localStorage.setItem(conversationStorageKey(session.email, session.tenantId), id);
    }
  }

  async function streamAnswer(
    payload: { message?: string; regenerate?: boolean },
    optimisticUserId?: string,
    restoreText?: string,
    replaceLastAssistant = false,
  ) {
    setSending(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++streamRequestId.current;
    const streamId = `stream-${Date.now()}`;
    let started = false;
    let completed = false;
    try {
      for await (const { event, data } of apiStream(
        '/v1/ai/chat/stream',
        { ...payload, conversationId, agent },
        controller.signal,
      )) {
        if (requestId !== streamRequestId.current) break;
        if (event === 'meta') {
          const meta = data as { conversationId: string; sources: Source[]; tools: Tool[] };
          setConversationId(meta.conversationId);
          rememberConversation(meta.conversationId);
          setMessages((current) => [
            ...(replaceLastAssistant && current[current.length - 1]?.role === 'assistant'
              ? current.slice(0, -1)
              : current),
            { id: streamId, role: 'assistant', content: '', streaming: true, sources: meta.sources, tools: meta.tools },
          ]);
          started = true;
        } else if (event === 'delta') {
          const { text } = data as { text: string };
          setMessages((current) => current.map((item) => (item.id === streamId ? { ...item, content: item.content + text } : item)));
        } else if (event === 'done') {
          const done = data as { messageId: string; mode: 'grounded' | 'evidence-only' };
          setMessages((current) => current.map((item) => (item.id === streamId
            ? { ...item, id: done.messageId, mode: done.mode, streaming: false }
            : item)));
          completed = true;
        } else if (event === 'error') {
          throw new Error((data as { message?: string }).message ?? 'Something went wrong. Please try again.');
        }
      }
    } catch (reason) {
      if (requestId === streamRequestId.current && !controller.signal.aborted) {
        setError(readError(reason));
        if (started && !completed) {
          setMessages((current) => current.map((item) => (item.id === streamId ? { ...item, failed: true } : item)));
        }
      }
      if (requestId === streamRequestId.current && !started && optimisticUserId && !controller.signal.aborted) {
        setMessages((current) => current.filter((item) => item.id !== optimisticUserId));
        if (restoreText) setQuestion(restoreText);
      }
    } finally {
      if (requestId === streamRequestId.current) {
        setMessages((current) => current
          .filter((item) => !(item.id === streamId && !item.content))
          .map((item) => (item.id === streamId ? { ...item, streaming: false } : item)));
        if (abortRef.current === controller) abortRef.current = null;
        setSending(false);
        void refreshSidebar().catch((reason: unknown) => setError(readError(reason)));
      }
    }
  }

  async function ask(event?: FormEvent, nextQuestion = question) {
    event?.preventDefault();
    const message = nextQuestion.trim();
    if (!message || sending) return;
    const optimisticMessageId = `local-${Date.now()}`;
    stickToBottom.current = true;
    setMessages((current) => [...current, { id: optimisticMessageId, role: 'user', content: message }]);
    setQuestion('');
    setSpeechPreview('');
    await streamAnswer({ message }, optimisticMessageId, message);
  }

  function stopGenerating() {
    abortRef.current?.abort();
  }

  async function regenerate() {
    if (sending || !conversationId) return;
    stickToBottom.current = true;
    await streamAnswer({ regenerate: true }, undefined, undefined, true);
  }

  async function copyMessage(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
    } catch {
      setError('Copying is not available in this browser.');
    }
  }

  useEffect(() => {
    const list = messageList.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  async function openConversation(id: string) {
    streamRequestId.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    stickToBottom.current = true;
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

  function selectUploads(files: File[]) {
    if (!files.length) return;
    setUploadMessage(null);
    if (files.length > MAX_UPLOAD_COUNT) {
      setSelectedFiles([]);
      if (fileInput.current) fileInput.current.value = '';
      setError(`Choose up to ${MAX_UPLOAD_COUNT} files at a time.`);
      return;
    }
    const invalidFile = files.map((file) => ({ file, reason: validateUpload(file) })).find((item) => item.reason);
    if (invalidFile?.reason) {
      setSelectedFiles([]);
      if (fileInput.current) fileInput.current.value = '';
      setError(`${invalidFile.file.name}: ${invalidFile.reason}`);
      return;
    }
    setError(null);
    setSelectedFiles(files);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectUploads(Array.from(event.currentTarget.files ?? []));
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) {
      setError('Choose or drop a document before uploading.');
      return;
    }
    if (!sessionReady.current) {
      setError('Sign in before uploading approved course material.');
      return;
    }
    if (files.length > MAX_UPLOAD_COUNT) {
      setError(`Choose up to ${MAX_UPLOAD_COUNT} files at a time.`);
      return;
    }
    const invalidFile = files.map((file) => ({ file, reason: validateUpload(file) })).find((item) => item.reason);
    if (invalidFile?.reason) {
      setError(`${invalidFile.file.name}: ${invalidFile.reason}`);
      return;
    }

    setUploading(true);
    setError(null);
    setUploadMessage(null);
    let uploadedCount = 0;
    const failures: string[] = [];
    try {
      for (const file of files) {
        const data = new FormData();
        data.append('file', file);
        try {
          await api('/v1/ai/documents/upload', { method: 'POST', body: data });
          uploadedCount += 1;
        } catch (reason) {
          failures.push(`${file.name}: ${readError(reason)}`);
        }
      }
      if (uploadedCount) {
        setSelectedFiles([]);
        if (fileInput.current) fileInput.current.value = '';
        try {
          await refreshSidebar();
          setUploadMessage(`Uploaded ${uploadedCount} document${uploadedCount === 1 ? '' : 's'} successfully.`);
        } catch (reason) {
          setError(`Uploaded ${uploadedCount} document${uploadedCount === 1 ? '' : 's'}, but the list could not refresh: ${readError(reason)}`);
        }
      }
      if (failures.length) {
        setError(`Could not upload ${failures.length} file${failures.length === 1 ? '' : 's'}: ${failures.join(' · ')}`);
      }
    } finally {
      setUploading(false);
    }
  }
  uploadFilesRef.current = uploadFiles;

  useEffect(() => {
    let dragDepth = 0;
    const isFileDrag = (event: globalThis.DragEvent) => (
      Boolean(event.dataTransfer?.files.length) || Array.from(event.dataTransfer?.types ?? []).includes('Files')
    );
    const handleDragEnter = (event: globalThis.DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setDraggingFile(true);
    };
    const handleDragOver = (event: globalThis.DragEvent) => {
      const transfer = event.dataTransfer;
      if (!transfer || !isFileDrag(event)) return;
      event.preventDefault();
      transfer.dropEffect = 'copy';
    };
    const handleDragLeave = (event: globalThis.DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) setDraggingFile(false);
    };
    const handleDrop = (event: globalThis.DragEvent) => {
      const transfer = event.dataTransfer;
      if (!transfer || !isFileDrag(event)) return;
      event.preventDefault();
      dragDepth = 0;
      setDraggingFile(false);
      void uploadFilesRef.current(Array.from(transfer.files));
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

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

  async function toggleVoiceAgent() {
    if (voiceSession.current) {
      voiceSession.current.stop();
      voiceSession.current = null;
      setVoiceStatus('idle');
      setVoiceLiveTranscript(null);
      return;
    }
    if (!hasSession || voiceStatus === 'connecting') return;

    setError(null);
    setVoiceStatus('connecting');
    try {
      const session = await api<{ conversationId: string; wsUrl: string }>('/v1/ai/voice/session', {
        method: 'POST',
        body: JSON.stringify({ conversationId }),
      });
      setConversationId(session.conversationId);
      const userSession = loadSession();
      if (userSession) {
        window.localStorage.setItem(conversationStorageKey(userSession.email, userSession.tenantId), session.conversationId);
      }
      void refreshSidebar().catch((reason: unknown) => setError(readError(reason)));

      const { WebSession } = await import('@omnidim-ai/client');
      const webSession = new WebSession();
      voiceSession.current = webSession;
      webSession.on('status', (status: SessionStatus) => {
        if (status === 'active') {
          setVoiceStatus('active');
        } else if (status === 'connecting') {
          setVoiceStatus('connecting');
        } else {
          voiceSession.current = null;
          setVoiceStatus('idle');
          setVoiceLiveTranscript(null);
          if (status.reason !== 'hangup' && status.reason !== 'stopped') {
            setError(`Voice session ended (${status.reason}). You can start another session.`);
          }
        }
      });
      webSession.on('transcript', (transcript) => {
        setVoiceLiveTranscript({ role: transcript.role, text: transcript.text });
        if (!transcript.final || !transcript.text.trim()) return;

        const localMessageId = `local-voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const role = transcript.role === 'user' ? 'user' : 'assistant';
        setMessages((current) => [...current, { id: localMessageId, role, content: transcript.text }]);
        setVoiceLiveTranscript(null);
        voiceTranscriptWrites.current = voiceTranscriptWrites.current.then(async () => {
          const saved = await api<{ messageId: string }>('/v1/ai/voice/transcript', {
            method: 'POST',
            body: JSON.stringify({ conversationId: session.conversationId, role, content: transcript.text }),
          });
          setMessages((current) => current.map((message) => (
            message.id === localMessageId ? { ...message, id: saved.messageId } : message
          )));
          void refreshSidebar().catch((reason: unknown) => setError(readError(reason)));
        }).catch((reason: unknown) => {
          setError(`Voice transcript could not be saved to history: ${readError(reason)}`);
        });
      });
      webSession.on('error', (reason) => {
        setError(`Voice agent error: ${reason.message}`);
      });
      await webSession.start({ wsUrl: session.wsUrl });
    } catch (reason) {
      voiceSession.current?.stop();
      voiceSession.current = null;
      setVoiceStatus('idle');
      setVoiceLiveTranscript(null);
      setError(readError(reason));
    }
  }

  function startNewConversation() {
    streamRequestId.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    voiceSession.current?.stop();
    voiceSession.current = null;
    setVoiceStatus('idle');
    setVoiceLiveTranscript(null);
    setConversationId(undefined);
    setMessages([]);
    setSpeechPreview('');
    const session = loadSession();
    if (session) {
      window.localStorage.removeItem(conversationStorageKey(session.email, session.tenantId));
    }
  }

  return (
    <>
    {draggingFile ? (
      <div className="ai-page-drop-overlay" role="status" aria-live="polite">
        <div><strong>Drop course material anywhere</strong><span>PDF, TXT, or Markdown · up to 8 files · 10 MB each</span></div>
      </div>
    ) : null}
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
        <form onSubmit={(event) => { event.preventDefault(); void uploadFiles(selectedFiles); }} className="ai-upload-form">
          <div
            className={`ai-dropzone${draggingFile ? ' dragging' : ''}`}
          >
            <label htmlFor="knowledge-file">{selectedFiles.length ? selectedFiles.map((file) => file.name).join(', ') : 'Drop a file anywhere on this page or choose one'}</label>
            <span>PDF, TXT, or Markdown · up to 8 files · 10 MB each</span>
            <input
              ref={fileInput}
              id="knowledge-file"
              name="document"
              type="file"
              multiple
              accept=".pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf"
              onChange={onFileChange}
              disabled={!hasSession || uploading}
            />
          </div>
          <button type="submit" className="btn-secondary" disabled={!hasSession || uploading || !selectedFiles.length}>
            {uploading ? 'Uploading…' : selectedFiles.length ? `Upload ${selectedFiles.length} document${selectedFiles.length === 1 ? '' : 's'}` : 'Choose a document first'}
          </button>
          {uploadMessage ? <p className="ai-upload-success" role="status">{uploadMessage}</p> : null}
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

        <div
          className="ai-message-list"
          aria-live="polite"
          ref={messageList}
          onScroll={(event) => {
            const el = event.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
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
              <h2>I’m your study helper. Ask me whatever you want.</h2>
              <p>Ask about what you’re learning. I can explain and summarize approved course material, help you revise, or plan a study session. For institution-specific answers, I rely on approved sources.</p>
            </div>
          ) : messages.map((message, messageIndex) => (
            <article key={message.id} className={`ai-message ${message.role}`}>
              <div className="ai-message-label">{message.role === 'assistant' ? 'Ricoz AI' : 'You'}</div>
              {message.role === 'assistant' ? <Markdown text={message.content} /> : <p>{message.content}</p>}
              {message.streaming ? <span className="ai-cursor" aria-hidden="true" /> : null}
              {message.failed ? <span className="ai-message-incomplete" role="status">This response may be incomplete.</span> : null}
              {message.role === 'assistant' && !message.streaming && !message.failed ? (
                <div className="ai-message-actions">
                  <button type="button" onClick={() => void copyMessage(message.id, message.content)}>{copiedId === message.id ? 'Copied' : 'Copy'}</button>
                  <button type="button" onClick={() => speak(message.content)}>Listen</button>
                  {messageIndex === messages.length - 1 && conversationId ? (
                    <button type="button" onClick={() => void regenerate()} disabled={sending}>Regenerate</button>
                  ) : null}
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
          {voiceLiveTranscript ? (
            <article className={`ai-message ${voiceLiveTranscript.role === 'user' ? 'user' : 'assistant'} ai-live-transcript`} role="status">
              <div className="ai-message-label">
                {voiceLiveTranscript.role === 'user' ? 'You · listening' : 'Ricoz AI · speaking'}
              </div>
              <p>{voiceLiveTranscript.text}</p>
            </article>
          ) : null}
          {sending && !messages.some((item) => item.streaming) ? <div className="ai-thinking"><span />Ricoz AI is checking approved evidence…</div> : null}
        </div>

        <form className="ai-composer" onSubmit={(event) => void ask(event)}>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void ask();
              }
            }}
            placeholder="Ask about a course, policy, or approved document… (Enter to send, Shift+Enter for a new line)"
            maxLength={4000}
            rows={3}
          />
          <div className="ai-composer-actions">
            <button
              type="button"
              className={voiceStatus === 'active' ? 'voice-agent-active' : 'voice-agent-button'}
              onClick={() => void toggleVoiceAgent()}
              disabled={!hasSession || voiceStatus === 'connecting'}
              aria-pressed={voiceStatus === 'active'}
            >
              {voiceStatus === 'connecting' ? 'Connecting…' : voiceStatus === 'active' ? '■ End voice conversation' : '◉ Start voice conversation'}
            </button>
            <button type="button" className={recording ? 'voice-recording' : 'voice-button'} onClick={() => void toggleRecording()} aria-pressed={recording}>
              {recording ? '■ Stop recording' : '◉ Ask by voice'}
            </button>
            {sending ? (
              <button type="button" className="btn-secondary" onClick={stopGenerating}>■ Stop</button>
            ) : (
              <button type="submit" className="btn-primary" disabled={!hasSession || !question.trim()}>Send question</button>
            )}
          </div>
        </form>
        {error ? <p className="error ai-error" role="alert">{error}</p> : null}
      </div>
    </section>
    </>
  );
}

function readError(reason: unknown) {
  if (!(reason instanceof Error)) return 'Something went wrong. Please try again.';
  if (reason.message.toLowerCase().includes('missing bearer token')) {
    return 'Your session is not signed in or has expired. Sign in to upload files, use the voice agent, and save conversation history.';
  }
  return reason.message;
}
