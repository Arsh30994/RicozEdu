import { AiService } from './ai.service';

describe('AiService evidence safeguards', () => {
  const service = new AiService({} as never, {} as never, {} as never, {} as never);
  const originalEnvironment = {
    provider: process.env.AI_PROVIDER,
    apiKey: process.env.GROQ_API_KEY,
    transcriptionModel: process.env.GROQ_TRANSCRIPTION_MODEL,
  };

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnvironment.provider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalEnvironment.provider;
    if (originalEnvironment.apiKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalEnvironment.apiKey;
    if (originalEnvironment.transcriptionModel === undefined) delete process.env.GROQ_TRANSCRIPTION_MODEL;
    else process.env.GROQ_TRANSCRIPTION_MODEL = originalEnvironment.transcriptionModel;
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
});
