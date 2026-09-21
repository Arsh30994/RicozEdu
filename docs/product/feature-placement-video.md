# Feature placement review — Provider-neutral video resources

**Assumption:** Feature = YouTube URL resources, OAuth channels, institution-hosted upload/HLS/CDN, watch ranges, quizzes/completion, iOS background upload, offline sync (as previously specified).

**Decision: Optional module** (not Core platform). Ship a **Smallest Useful Version** under Academics/LMS boundary; defer marketplace until ?2 tenants prove retention.

**Do not approve** a full YouTube+OAuth+offline+iOS BG upload suite merely because Moodle/Canvas/competitors ship video.

---

## Placement verdict

| Option | Fit |
|--------|-----|
| Core platform | **No** — not required for identity, enrolment, grades, fees, or single student record integrity |
| Configurable workflow | **No** — not a lifecycle state machine; content delivery |
| **Optional module** | **Yes** — tenant/institution enablement; deep hooks to enrolment, assessment completion, notifications |
| Integration | Partial — YouTube Data API & storage/CDN are integrations *inside* the module |
| Marketplace extension | Later — after module API/SDK stability |
| Not now | Valid alternative if no paying tenant demands instruction media in 2 quarters |
| Reject | **No** — genuine teaching need exists; reject only the “full LMS video parity” scope |

---

## Evaluation (1–20)

| # | Criterion | Assessment |
|---|-----------|------------|
| 1 | **User problem** | Faculty need assignable video; students need resume/progress; institutions need high-stakes completion that YouTube cannot certify. Real problem. |
| 2 | **Frequency** | Daily during term for teaching tenants; zero for pure SIS/exam-only tenants. |
| 3 | **Affected roles** | Faculty, students, instructional designers, IT (upload), registrar (only if completion gates credit). ~3–5 roles. |
| 4 | **Strategic fit (single student record)** | Progress/completion **events** belong on the student academic timeline; media blobs and players do **not** belong in core identity/grade tables. Fit = **event hooks**, not core schema sprawl. |
| 5 | **Regulatory necessity** | Captions/accessibility often required; YouTube alone may fail institutional policy for high-stakes. Hosted path + captions = compliance support, not a law that forces full LMS. |
| 6 | **Revenue value** | Upsell module / seat add-on; storage+egress pass-through. Medium–high if teaching is sold; low for SIS-only deals. |
| 7 | **Retention value** | High for teaching-led campuses; sticky if progress/grades depend on it. Low if used as “nice player.” |
| 8 | **Implementation cost** | High: upload, virus scan, transcode, HLS, CDN, players, YouTube metadata, offline sync, iOS BG. Multi-quarter. |
| 9 | **Support cost** | High: playback failures, codec, CDN, YouTube policy changes, device quirks. |
| 10 | **Data-model complexity** | Medium–high (already sketched in migration 007); watch ranges + completion rules add integrity burden. |
| 11 | **Permission complexity** | Medium: `media.*`, section-scoped grants; avoid counselling/finance bleed. |
| 12 | **Upgrade risk** | Medium: pipeline workers, object keys, player contracts; YouTube API churn. |
| 13 | **Integration burden** | High: S3/GCS, CDN, AV scanners, YouTube OAuth, APNs-adjacent offline. |
| 14 | **Accessibility burden** | High: captions, transcripts, player keyboard/SR, reduced motion — AA mandatory if shipped. |
| 15 | **Mobile burden** | High if iOS BG upload + offline sync required in v1; medium if stream-only. |
| 16 | **AI implications** | Transcripts invite summarization/quiz gen — must stay tenant-scoped; no auto grade credit without human policy. |
| 17 | **Security implications** | Signed URLs, token leakage, unlisted?secure, path traversal on objects, SSRF on thumbnail URLs. |
| 18 | **Potential duplication** | Overlaps external LMS; risk of rebuilding Canvas. Prefer embed/LTI later over cloning. |
| 19 | **Adoption risk** | Faculty skip upload and paste YouTube; hosted pipeline unused ? cost without value. |
| 20 | **Retirement plan** | Feature-flag off; freeze uploads; read-only playback 12 months; export manifests + progress events to object package; drop transcode workers. |

---

## Smallest useful version (SUV)

**In SUV**
- Institution-hosted **or** YouTube URL resource (no channel OAuth).
- Metadata fetch for public/unlisted YouTube (title, duration, embeddability) with clear **unavailable** states.
- `youtube-nocookie` embed: `autoplay=0`, `controls=1`, `playsinline=1`, `origin` set; JS API only if progress needs it.
- Signed upload ? object storage ? async virus scan ? basic MP4 or single HLS rendition (one quality OK).
- Progress: last position + **merged watched ranges** + heartbeat; YouTube completion = **approximate** only.
- Completion rule: percent threshold on **institution** video; optional link to existing quiz instrument for high-stakes.
- Web player with captions file upload (VTT); keyboard operable.
- Permissions: `media.read` / `media.manage` / `media.upload`; section grants.
- Tenant module flag `modules.video.enabled`.

**Explicit non-goals (v1)**
- YouTube channel OAuth / private video via shared institutional Google account.
- Multi-bitrate ABR ladder, DRM, interactive video editor.
- iOS background upload & offline sync.
- Marketplace / third-party player plugins.
- AI auto-caption as sole caption source for high-stakes.
- Replacing a full LMS (discussions, assignments UI beyond completion hook).

---

## Success metrics

| Metric | Target (2 terms) |
|--------|------------------|
| Module attach rate (eligible tenants) | ? 30% enable |
| Weekly active faculty publishers | ? 20% of teaching faculty on enabled tenants |
| Student resume rate (return within 7d) | ? 40% of starters |
| High-stakes completions on institution host (not YouTube-only) | ? 95% of credit-bearing video completions |
| P1 playback incidents / 1k hours | &lt; 2 |
| Caption coverage on new hosted videos | ? 90% within 7 days of publish |

---

## Kill criteria (sunset or freeze investment)

- &lt; 10% attach after 2 selling quarters, **or**
- &gt; 70% of views are YouTube-only with zero hosted uploads (pipeline cost unjustified), **or**
- Support cost &gt; 15% of module ARR for 2 consecutive quarters, **or**
- Major accessibility audit fail unrepaired within 1 quarter of GA.

---

## Extension strategy

1. **Module API** — resources, progress, completion webhooks into gradebook/workflows.
2. **Integrations** — LTI 1.3 Deep Linking to external LMS; keep RicozEdu as system of record for *completion events* only.
3. **Marketplace** — captioning vendors, proctoring, interactive overlays — only after SUV stable contracts.
4. **AI add-on** — optional quiz draft from transcript; never auto-approve credit.

---

## Recommendation summary

| | |
|--|--|
| **Place** | Optional module |
| **Now?** | SUV yes if ?1 design-partner tenant teaching online; else **Not now** |
| **Reject** | Full competitor LMS video parity, private YouTube-via-shared-account, offline/iOS BG in v1 |
