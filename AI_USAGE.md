# Ricoz AI: setup and safety

Ricoz AI is a tenant-scoped academic assistant. It answers from approved documents and, when enabled, from a small set of read-only academic tools. It does not make registration, grading, fee, or policy decisions.

## Run locally

1. Copy `.env.example` to `.env` and start PostgreSQL and Redis with `docker compose up -d postgres redis`.
2. Run `pnpm migrate` to add the AI knowledge, conversation, and study tables.
3. Start the API with `pnpm --filter @ricozedu/api dev` and the web app with `pnpm --filter @ricozedu/web dev`.
4. Sign in to a tenant that has the new role permissions, then open `/assistant` or `/study`.

## AI provider configuration

The safe default is `AI_PROVIDER=disabled`. In this mode Ricoz AI never simulates a generated answer: it only returns approved source excerpts or an honest “could not verify” response.

To enable grounded responses and server-side voice transcription with Groq, set these server-only values in `.env`:

```dotenv
AI_PROVIDER=groq
GROQ_API_KEY=your-server-side-key
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo
```

Never expose `GROQ_API_KEY` through `NEXT_PUBLIC_*` variables or frontend code.

## Data flow

- Administrators with `ai.document.manage` upload approved PDF, TXT, or Markdown materials.
- Ricoz extracts readable text, splits it into bounded chunks, and stores it inside the tenant’s database schema.
- A question searches only chunks in the current tenant. Source titles and excerpts are returned with the answer.
- The assistant treats user messages and uploaded documents as untrusted data, never as instructions that can override safety rules.
- Chat history and generated study artifacts are protected by tenant **and user** RLS policies.

## Academic agent

Academic agent mode has three bounded, read-only operations: approved document search, degree-progress explanation, and registration-eligibility explanation. Progress and eligibility require the relevant IDs. The server derives the tenant and user from the signed-in request, checks the user’s existing academic permission, and calls the established `AcademicsService`. The model does not execute SQL, shells, URLs, or arbitrary services.

## Voice and study tools

The assistant supports recorded voice questions through `/v1/ai/transcribe` when Groq speech transcription is configured. Audio is only forwarded to Groq for that request and is not persisted by RicozEdu. Browser text-to-speech is used for the optional Listen button.

The Study Companion produces source-linked flashcards and comprehension quizzes from selected approved documents. Revision plans are deterministic schedules based on the learner’s selected subjects, target date, and minutes per day. Generated outputs are study aids, never official assessment content.

## Known limits

- Scanned or password-protected PDFs need OCR before upload.
- The initial retrieval engine uses PostgreSQL full-text search, not embeddings. This is intentional until relevance data justifies adding `pgvector`.
- Voice transcription needs a configured provider; typed chat continues to work without it.
- AI responses are non-streaming in this initial version and have bounded provider/tool execution times.
