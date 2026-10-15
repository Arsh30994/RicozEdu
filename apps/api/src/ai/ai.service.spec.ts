import { AiService } from './ai.service';

describe('AiService evidence safeguards', () => {
  const service = new AiService({} as never, {} as never, {} as never, {} as never);
  const originalEnvironment = {
    provider: process.env.AI_PROVIDER,
    apiKey: process.env.GROQ_API_KEY,
    transcriptionModel: process.env.GROQ_TRANSCRIPTION_MODEL,
    omniApiKey: process.env.OMNIDIM_API_KEY,
    omniAgentId: process.env.OMNIDIM_AGENT_ID,
  };

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnvironment.provider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalEnvironment.provider;
    if (originalEnvironment.apiKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalEnvironment.apiKey;
    if (originalEnvironment.transcriptionModel === undefined) delete process.env.GROQ_TRANSCRIPTION_MODEL;
    else process.env.GROQ_TRANSCRIPTION_MODEL = originalEnvironment.transcriptionModel;
    if (originalEnvironment.omniApiKey === undefined) delete process.env.OMNIDIM_API_KEY;
    else process.env.OMNIDIM_API_KEY = originalEnvironment.omniApiKey;
    if (originalEnvironment.omniAgentId === undefined) delete process.env.OMNIDIM_AGENT_ID;
    else process.env.OMNIDIM_AGENT_ID = originalEnvironment.omniAgentId;
  });

  it('splits long approved text into bounded overlapping chunks', () => {
    const internals = service as unknown as { chunkDocument(value: string): string[] };
    const source = `${'A useful approved sentence. '.repeat(150)}End of the course policy.`;
    const chunks = internals.chunkDocument(source);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1800)).toBe(true);
    expect(chunks.join(' ')).toContain('End of the course policy.');
  });

  it('does not fabricate an answer when no approved evidence exists', () => {
    const internals = service as unknown as { evidenceOnlyAnswer(sources: [], tools: []): string };
    expect(internals.evidenceOnlyAnswer([], [])).toMatch(/could not verify/i);
  });

  it('uses Groq chat completions with approved evidence', async () => {
    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'test-groq-key';
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'Verified answer.' } }] }), { status: 200 }),
    );
    const internals = service as unknown as {
      generateGroundedAnswer(question: string, sources: Array<{
        documentId: string;
        title: string;
        chunkId: string;
        ordinal: number;
        excerpt: string;
      }>, tools: []): Promise<{ mode: string; text: string }>;
    };

    const answer = await internals.generateGroundedAnswer('What is approved?', [{
      documentId: 'doc-1',
      title: 'Course guide',
      chunkId: 'chunk-1',
      ordinal: 0,
      excerpt: 'Approved course evidence.',
    }], []);

    expect(answer).toEqual({ mode: 'grounded', text: 'Verified answer.' });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-groq-key' }),
        body: expect.stringContaining('Approved course evidence.'),
      }),
    );
  });

  it('uses Groq transcription with the configured model', async () => {
    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.GROQ_TRANSCRIPTION_MODEL = 'whisper-test';
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ text: '  What is the course policy?  ' }), { status: 200 }),
    );

    await expect(service.transcribe({
      buffer: Buffer.from('fake audio'),
      originalname: 'question.webm',
      mimetype: 'audio/webm',
      size: 10,
    })).resolves.toEqual({ transcript: 'What is the course policy?' });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-groq-key' },
        body: expect.any(FormData),
      }),
    );
    const request = fetch.mock.calls[0]?.[1];
    expect((request?.body as FormData).get('model')).toBe('whisper-test');
  });

  it('creates an OmniDimension voice session without exposing the server API key', async () => {
    process.env.OMNIDIM_API_KEY = 'server-only-test-key';
    process.env.OMNIDIM_AGENT_ID = '123';
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'conversation-1' }] });
    const db = { withTenantTx: jest.fn(async (_tenantId: string, _userId: string, operation: (client: { query: typeof query }) => unknown) => operation({ query })) };
    const voiceService = new AiService(db as never, {} as never, {} as never, {} as never);
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ session_id: 'session-1', ws_url: 'wss://sessions.omnidim.io/temporary' }), { status: 200 }),
    );

    await expect(voiceService.createVoiceSession({
      tenantId: 'tenant-1',
      userId: 'user-1',
      membershipId: 'membership-1',
      authorizationVersion: 1,
      correlationId: 'correlation-1',
    })).resolves.toEqual({
      conversationId: 'conversation-1',
      wsUrl: 'wss://sessions.omnidim.io/temporary',
      sessionId: 'session-1',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://omnidim.io/api/v1/sessions/create',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer server-only-test-key' }),
        body: JSON.stringify({ agent_id: 123, type: 'voice' }),
      }),
    );
  });

  it('saves finalized voice turns to the requested conversation history', async () => {
    const conversationId = '23e4567-e89b-12d3-a456-426614174000';
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: conversationId }] })
      .mockResolvedValueOnce({ rows: [{ id: 'voice-message-1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const db = {
      withTenantTx: jest.fn(async (_tenantId: string, _userId: string, operation: (client: { query: typeof query }) => unknown) => operation({ query })),
    };
    const voiceService = new AiService(db as never, {} as never, {} as never, {} as never);

    await expect(voiceService.saveVoiceTranscript({
      tenantId: 'tenant-1',
      userId: 'user-1',
      membershipId: 'membership-1',
      authorizationVersion: 1,
      correlationId: 'correlation-1',
    }, {
      conversationId,
      role: 'assistant',
      content: 'Hello, how can I help?',
    })).resolves.toEqual({ messageId: 'voice-message-1' });

    expect(query.mock.calls[1]?.[0]).toContain('INSERT INTO ai_messages');
    expect(query.mock.calls[1]?.[1]).toEqual([
      'tenant-1',
      conversationId,
      'user-1',
      'assistant',
      'Hello, how can I help?',
      '[]',
      '[]',
    ]);
    expect(query.mock.calls[2]?.[0]).toContain('UPDATE ai_conversations');
  });

  it('builds and saves an AI plan from syllabus evidence and the learner pace', async () => {
    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'test-groq-key';
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const targetDate = new Date(todayUtc + 2 * 86_400_000).toISOString().slice(0, 10);
    const generatedPlan = {
      summary: 'Review the remaining database topics in short, focused blocks.',
      sessions: [
        { day: 1, subject: 'Database systems', topic: 'Normalization', minutes: 60, focus: 'Recall normal forms, then check the syllabus examples.' },
        { day: 2, subject: 'Database systems', topic: 'Indexes', minutes: 45, focus: 'Compare index types and finish with a short self-test.' },
      ],
    };
    const query = jest.fn()
      .mockResolvedValueOnce({
        rows: [{
          chunk_id: 'chunk-1',
          document_id: 'document-1',
          title: 'Database syllabus',
          ordinal: 0,
          content: 'Unit 1: normalization and functional dependencies.',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'artifact-1', created_at: '2026-10-15T00:00:00.000Z' }] });
    const db = {
      withTenantTx: jest.fn(async (_tenantId: string, _userId: string | null, operation: (client: { query: typeof query }) => unknown) => operation({ query })),
    };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const planService = new AiService(db as never, audit as never, {} as never, {} as never);
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(generatedPlan) } }],
    }), { status: 200 }));

    const result = await planService.createRevisionPlan({
      tenantId: 'tenant-1',
      userId: 'user-1',
      membershipId: 'membership-1',
      authorizationVersion: 1,
      correlationId: 'correlation-1',
    }, {
      documentIds: ['document-1'],
      subjects: ['Database systems'],
      targetDate,
      minutesPerDay: 90,
      minutesPerTopic: 30,
      completionPercent: 25,
    });

    expect(result.kind).toBe('revision_plan');
    expect(result.content).toEqual({
      targetDate,
      summary: generatedPlan.summary,
      sessions: [
        { ...generatedPlan.sessions[0], date: new Date(todayUtc + 86_400_000).toISOString().slice(0, 10) },
        { ...generatedPlan.sessions[1], date: targetDate },
      ],
    });
    expect(result.sources.map((source) => source.title)).toEqual(['Database syllabus']);
    expect(fetch).toHaveBeenCalledWith('https://api.groq.com/openai/v1/chat/completions', expect.anything());
    const request = fetch.mock.calls[0]?.[1];
    const requestPayload = JSON.parse(String(request?.body)) as { messages: Array<{ role: string; content: string }> };
    const learnerInput = JSON.parse(requestPayload.messages.find((message) => message.role === 'user')?.content ?? '{}') as {
      typicalMinutesPerTopic?: number;
    };
    expect(learnerInput.typicalMinutesPerTopic).toBe(30);
    expect(query.mock.calls[1]?.[0]).toContain('INSERT INTO ai_study_artifacts');
  });
});
