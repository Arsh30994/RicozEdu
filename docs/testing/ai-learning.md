# AI learning verification

Run the checks from the repository root:

```bash
pnpm --filter @ricozedu/shared-auth build
pnpm --filter @ricozedu/shared-types build
pnpm --filter @ricozedu/api typecheck
pnpm --filter @ricozedu/web typecheck
pnpm --filter @ricozedu/api test -- ai.service.spec.ts
```

Manual checks after applying migrations:

1. Sign in as a TenantAdmin, upload a TXT, Markdown, and text-based PDF through `/assistant`.
2. Ask a question containing a unique phrase from the document. Confirm the document title appears as a source.
3. Ask a question with no matching document. Confirm Ricoz AI says it cannot verify the answer rather than inventing one.
4. Open a second user in the same tenant. Confirm neither user can open the other user’s conversation URL or study artifacts.
5. Use Academic agent mode with valid identifiers. Confirm only a permitted role receives degree-progress or eligibility data.
6. Deny microphone permission and upload a file larger than 10 MB. Confirm both actions fail with clear errors.
7. With `AI_PROVIDER=disabled`, confirm source-backed evidence still works and the UI labels it **Evidence-only**.

Do not run migrations against production without a reviewed backup and change plan.
