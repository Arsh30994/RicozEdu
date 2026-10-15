'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type DocumentInfo = { id: string; title: string; source_type: string; status: string; chunkCount: number };
type Source = { documentId: string; title: string; ordinal: number; excerpt: string };
type Flashcard = { id: string; question: string; answer: string; source: Source };
type QuizItem = { id: string; prompt: string; options: string[]; correctIndex: number; explanation: string; source: Source };
type Session = { day: number; date: string; subject: string; topic: string; minutes: number; focus: string };

export default function StudyPage() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [quiz, setQuiz] = useState<QuizItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [plan, setPlan] = useState<Session[]>([]);
  const [planSummary, setPlanSummary] = useState('');
  const [planSources, setPlanSources] = useState<string[]>([]);
  const [busy, setBusy] = useState<'cards' | 'quiz' | 'plan' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<DocumentInfo[]>('/v1/ai/documents').then(setDocuments).catch((reason: unknown) => setError(readError(reason)));
  }, []);

  function toggleDocument(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function generate(kind: 'cards' | 'quiz') {
    if (!selected.length) {
      setError('Select at least one approved document first.');
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      const path = kind === 'cards' ? '/v1/ai/study/flashcards' : '/v1/ai/study/quiz';
      const result = await api<{ content: { cards?: Flashcard[]; items?: QuizItem[] } }>(path, {
        method: 'POST',
        body: JSON.stringify({ documentIds: selected, topic: topic.trim() || undefined, questionCount: 5 }),
      });
      if (kind === 'cards') setCards(result.content.cards ?? []);
      else { setQuiz(result.content.items ?? []); setAnswers({}); }
    } catch (reason) {
      setError(readError(reason));
    } finally {
      setBusy(null);
    }
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length) {
      setError('Select at least one approved syllabus or course document first.');
      return;
    }
    const form = new FormData(event.currentTarget);
    const subjects = String(form.get('subjects') ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    setBusy('plan');
    setError(null);
    try {
      const result = await api<{
        content: { summary: string; sessions: Session[] };
        sources: Array<{ title: string }>;
      }>('/v1/ai/study/plan', {
        method: 'POST',
        body: JSON.stringify({
          documentIds: selected,
          subjects,
          targetDate: form.get('targetDate'),
          minutesPerDay: Number(form.get('minutesPerDay')),
          minutesPerTopic: Number(form.get('minutesPerTopic')),
          completionPercent: Number(form.get('completionPercent')),
        }),
      });
      setPlan(result.content.sessions ?? []);
      setPlanSummary(result.content.summary);
      setPlanSources([...new Set(result.sources.map((source) => source.title))]);
    } catch (reason) {
      setError(readError(reason));
    } finally {
      setBusy(null);
    }
  }

  const correct = quiz.filter((item) => answers[item.id] === item.correctIndex).length;

  return (
    <section className="study-page">
      <header className="study-hero">
        <span className="eyebrow">Study companion</span>
        <h1>Turn approved course material into practice.</h1>
        <p>Flashcards and quizzes only use the documents you select. They are AI-assisted learning drafts, not official examination content.</p>
      </header>

      <div className="study-layout">
        <aside className="study-source-picker card">
          <h2>1. Pick your sources</h2>
          <p className="muted">Select approved sources for flashcards, quizzes, and your AI study plan.</p>
          <div className="study-doc-options">
            {documents.map((document) => <label key={document.id}><input type="checkbox" checked={selected.includes(document.id)} onChange={() => toggleDocument(document.id)} /><span><strong>{document.title}</strong><small>{document.chunkCount} excerpts</small></span></label>)}
            {!documents.length ? <p className="empty-state">Add a syllabus or course document in Ricoz AI before creating study material.</p> : null}
          </div>
          <label htmlFor="study-topic">Optional topic focus</label>
          <input id="study-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. database normalization" />
          <div className="study-actions"><button className="btn-primary" type="button" disabled={busy !== null} onClick={() => void generate('cards')}>{busy === 'cards' ? 'Creating…' : 'Create flashcards'}</button><button className="btn-secondary" type="button" disabled={busy !== null} onClick={() => void generate('quiz')}>{busy === 'quiz' ? 'Creating…' : 'Create quiz'}</button></div>
        </aside>

        <div className="study-content">
          {cards.length ? <section className="card study-result"><div className="study-result-head"><div><span className="eyebrow">Evidence-based flashcards</span><h2>Review one concept at a time</h2></div><span>{cards.length} cards</span></div><div className="flashcard-grid">{cards.map((card) => <article className="flashcard" key={card.id}><div className="flashcard-inner"><div className="flashcard-front"><span>Question</span><strong>{card.question}</strong></div><div className="flashcard-back"><span>Answer from {card.source.title}</span><p>{card.answer}</p></div></div></article>)}</div></section> : <section className="study-placeholder card"><span>✦</span><h2>Choose material, then start studying</h2><p>Generated flashcards will be tied back to a source document.</p></section>}

          {quiz.length ? <section className="card study-result"><div className="study-result-head"><div><span className="eyebrow">Practice quiz</span><h2>Test your understanding</h2></div><span>{correct}/{quiz.length} correct</span></div><div className="quiz-list">{quiz.map((item, index) => <article key={item.id} className="quiz-question"><strong>{index + 1}. {item.prompt}</strong>{item.options.map((option, optionIndex) => <label key={`${item.id}-${optionIndex}`} className={answers[item.id] === optionIndex ? 'selected' : ''}><input type="radio" name={item.id} checked={answers[item.id] === optionIndex} onChange={() => setAnswers((current) => ({ ...current, [item.id]: optionIndex }))} />{option}</label>)}{answers[item.id] !== undefined ? <p className={answers[item.id] === item.correctIndex ? 'answer-ok' : 'answer-warn'}>{answers[item.id] === item.correctIndex ? 'Correct. ' : 'Review this one. '}{item.explanation}</p> : null}</article>)}</div></section> : null}

          <section className="card revision-planner">
            <div>
              <span className="eyebrow">AI revision planner</span>
              <h2>Build a syllabus-aware study schedule</h2>
              <p className="muted">The AI reviews your selected course material and adjusts the workload to your deadline, daily availability, study pace, and progress.</p>
            </div>
            <form onSubmit={(event) => void createPlan(event)}>
              <label>Subjects to prioritize (optional)<input name="subjects" placeholder="e.g. Algorithms, Database systems" /></label>
              <label>Target date<input name="targetDate" type="date" required min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)} /></label>
              <label>Available minutes per day<input name="minutesPerDay" type="number" min="15" max="480" defaultValue="120" required /></label>
              <label>Typical minutes per topic<input name="minutesPerTopic" type="number" min="10" max="300" defaultValue="45" required /></label>
              <label>Syllabus already covered (%)<input name="completionPercent" type="number" min="0" max="100" defaultValue="0" required /></label>
              <button className="btn-primary" disabled={busy !== null} type="submit">{busy === 'plan' ? 'Reviewing syllabus…' : 'Create AI plan'}</button>
            </form>
            {selected.length ? <p className="study-plan-source-note">Plan sources: {documents.filter((document) => selected.includes(document.id)).map((document) => document.title).join(', ')}</p> : <p className="study-plan-source-note">Select syllabus documents in “Pick your sources” to generate a plan.</p>}
            {plan.length ? (
              <div className="study-plan-result">
                <div className="study-plan-summary">
                  <div><span className="eyebrow">Your personalized schedule</span><p>{planSummary}</p></div>
                  <span>{plan.reduce((total, session) => total + session.minutes, 0)} total study minutes</span>
                </div>
                {planSources.length ? <p className="study-plan-citations">Based on: {planSources.join(', ')}</p> : null}
                <ol className="revision-sessions">{plan.map((session) => <li key={session.day}>
                  <div><strong>{session.date} · {session.subject}</strong><span>{session.topic}</span></div>
                  <div className="revision-session-detail"><strong>{session.minutes ? `${session.minutes} min` : 'Rest / buffer'}</strong><span>{session.focus}</span></div>
                </li>)}</ol>
              </div>
            ) : null}
          </section>
        </div>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
  );
}

function readError(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Something went wrong. Please try again.';
}
