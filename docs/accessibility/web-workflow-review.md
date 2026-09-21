# Accessibility & usability review ó RicozEdu web workflows

**Scope:** Implemented screens (Home, Login, Admin curriculum publish, Admin rules, Student progress) and the shared shell in `apps/web`. Target **WCAG 2.2 AA**.

**Workflow reviewed:** Sign in ? navigate ? publish programme version / validate rules / load degree progress.

---

## Issues by severity

### Critical

| ID | Issue | Where | WCAG |
|----|-------|-------|------|
| C1 | **Destructive publish without confirmation** ó ìSimulate & publishî is one click; accidental publish is irreversible (API immutability). No confirm dialog, no typed confirm, no Undo. | `/admin/curriculum` | 3.3.4 (Error Prevention AA for legal/financial-like academic commitments) + usability |
| C2 | **No loading / busy state during network calls** ó submit buttons stay enabled; duplicate submits; screen readers get no `aria-busy` / live ìWorkingÖî. Slow network feels broken. | Login, Curriculum, Progress | 4.1.3 Status Messages; usability |

### High

| ID | Issue | Where | WCAG |
|----|-------|-------|------|
| H1 | **Rules validation errors use `role="status"` not `alert`** ó invalid JSON may not be announced urgently; success and failure share the same live region semantics. | `/admin/rules` | 4.1.3 |
| H2 | **API/raw errors shown as UI copy** ó e.g. `Request failed (403)` / Zod dumps; not plain language; may expose internals. | `lib/api.ts` + pages | 3.3.1, 3.3.3 |
| H3 | **UUID-as-primary-UI** ó programme version / membership / enrolment IDs as the only inputs create high cognitive load and transcription errors; no searchable picker or recent list. | Curriculum, Progress | Usability; 3.3.2 (labels alone insufficient for complex IDs) |
| H4 | **No session/auth affordance** ó after login, no ìSigned in asÖî, logout, or expired-token recovery on other pages; silent 401. | Shell + all authed pages | Usability; 3.3.1 |
| H5 | **Primary nav exposes Admin to everyone** ó students see admin links; wrong scope increases error rate and confusion (not authorization by itself). | `layout.tsx` | Usability; 2.4.4 Link Purpose |

### Medium

| ID | Issue | Where | WCAG |
|----|-------|-------|------|
| M1 | **No current-page indication** ó nav links lack `aria-current="page"`. | Shell | 2.4.8 (AAA) / usability AA best practice |
| M2 | **Muted text contrast risk** ó `#5b645c` on cream/`#fffdf8` panels may fall near/under 4.5:1 for small text; verify measured. | `.muted` | 1.4.3 Contrast |
| M3 | **Link vs button affordance** ó nav links rely on color (`--accent`) without underline by default; hover/focus heavy on color. | `.top a` | 1.4.1 Use of Color |
| M4 | **Broken glyph in lists** (`ù`) between label and summary ó screen readers may announce junk; sighted users see corruption. | Curriculum, Progress | 1.3.1, 1.1.1 |
| M5 | **Success after login not linked to next action** ó status text only; no focus move to next heading or primary CTA. | Login | 2.4.3 Focus Order (usability) |
| M6 | **No empty states** ó progress panel absent until submit; no ìEnter IDs to loadî empty illustration/instructions beyond muted blurb. | Progress | Usability |
| M7 | **No offline / reconnect messaging** ó `fetch` failures become generic errors. | All | Usability |
| M8 | **`lang="en"` only** ó no localization strategy; dates/numbers not locale-aware. | Layout | 3.1.1 (ok for en-only) / i18n gap |
| M9 | **No `prefers-reduced-motion`** ó backdrop blur / gradients may bother vestibular users (low motion today, but no policy). | CSS | 2.3.3 (AAA) / best practice |
| M10 | **Touch targets** ó buttons ~padding only; on small screens nav wrap is OK but link hit areas may be &lt; 24◊24 CSS px (WCAG 2.2 **2.5.8 Target Size Minimum**). | Nav, buttons | 2.5.8 AA |

### Low / observations (pass or N/A)

| ID | Note |
|----|------|
| L1 | Skip link + `#main` present ó good. |
| L2 | Login labels, `autocomplete`, `role="alert"` on errors ó good baseline. |
| L3 | `:focus-visible` outline 3px `--focus` ó good visibility. |
| L4 | No modals, toasts, tables, charts yet ó N/A; design criteria below for when added. |
| L5 | Captions/transcripts ó N/A on these screens (video domain elsewhere). |
| L6 | Keyboard order is DOM order (header ? main ? fields ? button) ó generally correct. |

---

## Corrected interaction design

### Shell
1. Role-aware nav: show Admin links only when session has manage permissions (or separate ìAdminî area with gate).
2. Persist `aria-current="page"` on active route.
3. Session chip: ìSigned in as {email} ∑ Tenant Öî + **Sign out** button.
4. Underline nav links or use icon+text; keep focus ring.
5. Min 44◊44 px touch targets for nav and primary buttons on small screens.

### Login
1. Disable submit while pending; `aria-busy="true"` on form; button text ìSigning inÖî.
2. On success: `role="status"` + move focus to a ìNext stepsî heading with links (Admin curriculum / Student progress).
3. On 401: plain language ó ìEmail or password is wrong. Try again or reset your password.î (no stack/API codes).
4. Optional: show/hide password toggle with accessible name.

### Admin curriculum (publish workflow)
1. Split actions: **Run simulation** (safe) then **Publish** (destructive).
2. Publish opens a **modal dialog** (`role="dialog"`, `aria-modal="true"`, initial focus on title, focus trap, Esc closes):
   - Summary of simulation (affected count, prerequisite OK/fail).
   - Explicit text: ìPublished versions cannot be edited. Corrections require a new version.î
   - Confirm checkbox or type programme code.
   - Buttons: Cancel (secondary) / Publish permanently (primary danger style + non-color: icon or label).
3. Loading: disable controls; live region ìSimulation runningÖî.
4. Results: use a **table** or definition list for sample students (not broken separators); empty sample ? ìNo sample students returned.î

### Admin rules
1. Validate ? if error: `role="alert"` + associate via `aria-describedby` / `aria-invalid` on textarea.
2. If success: `role="status"`.
3. Provide ìFormat JSONî and line/column of parse error in plain language.

### Student progress
1. Prefer student context from session (no pasting membership UUID when self-service).
2. Loading skeleton + `aria-busy`.
3. Empty state panel before first load.
4. Eligible / Not eligible: text **and** icon (check/cross), not color alone.
5. Hide raw `ruleVersionRefs` JSON behind a disclosure `<details>` for advanced users.

### Global states
| State | Design |
|-------|--------|
| Loading | Disable submit; spinner with accessible name; `aria-busy` |
| Empty | Instructional panel + primary CTA |
| Offline | Banner `role="alert"`: ìYouíre offline. Changes arenít saved.î |
| Slow | After 3s, status: ìStill working ó slow network.î |
| Error | Plain language + recovery (ìTry againî, ìSign in againî) |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` ? disable blur/animation |

---

## Accessibility acceptance criteria (WCAG 2.2 AA)

- [ ] All interactive elements reachable and operable via keyboard only (Tab/Shift+Tab/Enter/Space/Esc).
- [ ] Visible focus indicator ? 3:1 against adjacent background on every focusable control.
- [ ] Focus order matches visual reading order; modal traps focus and restores on close.
- [ ] Every input has a persistent visible `<label>` (or `aria-labelledby`).
- [ ] Errors identified in text (not color alone), announced via `role="alert"` / `aria-live="assertive"` as appropriate, and programmatically associated with fields (`aria-invalid`, `aria-describedby`).
- [ ] Status messages (success, loading complete) use `role="status"` / polite live regions without stealing focus unless necessary.
- [ ] Text contrast ? 4.5:1 (normal), ? 3:1 (large); UI components/graphics ? 3:1.
- [ ] Meaning not conveyed by color alone (eligibility, errors, nav current).
- [ ] Target size ? 24◊24 CSS px (2.5.8); spacing where targets are smaller.
- [ ] Page `lang` correct; language of parts if mixed.
- [ ] Skip link works and is visible on focus.
- [ ] Destructive actions require confirmation; no silent irreversible publish.
- [ ] Loading/empty/offline/slow each have an accessible, plain-language state.
- [ ] `prefers-reduced-motion` respected for any motion.
- [ ] When video appears: captions (1.2.2) and transcript link for prerecorded content.
- [ ] iOS VoiceOver / Android TalkBack: form labels, buttons, alerts, and dialog titles announced correctly (manual sign-off).

---

## Automated test suggestions

```bash
# axe-core via Playwright/Cypress on each route (authenticated + anonymous)
# Assert: zero serious/critical axe violations for wcag22aa tags
```

| Test | Assert |
|------|--------|
| axe login/curriculum/rules/progress | No `color-contrast`, `label`, `button-name`, `link-name` serious issues |
| Keyboard smoke | Tab cycle reaches skip ? nav ? fields ? submit; no keyboard trap on pages |
| Focus visible | Computed outline/box-shadow non-none on `:focus-visible` |
| Publish confirm | Publish button does not call API until dialog confirm (component test) |
| Busy state | While pending, submit `disabled` and `aria-busy=true` |
| Live regions | Error node has `role="alert"`; success `role="status"` |
| Contrast unit | Snapshot token pairs `--ink/--bg`, `--danger/--card`, `.muted` vs panel |
| Nav current | Active route sets `aria-current="page"` |

---

## Manual test instructions

### Keyboard (desktop)
1. Load `/`. Press Tab ? **Skip to content** appears; Activate ? focus in `#main`.
2. Tab through Primary nav ? Login. Confirm focus ring always visible.
3. On Login: complete fields with keyboard only; submit; confirm alert announces on bad password (VoiceOver/NVDA).
4. Curriculum: attempt Publish ? **must** open confirm dialog; Esc cancels; focus returns to Publish control.

### Screen readers
| Engine | Checks |
|--------|--------|
| **NVDA/JAWS (Chrome)** | Landmarks (banner/navigation/main); form mode labels; alert on errors; dialog name |
| **iOS VoiceOver** | Swipe through login fields; Rotor Form Controls; confirm Publish dialog; dynamic progress results |
| **Android TalkBack** | Same; ensure button ìSimulate & publishî name is clear; live regions fire on error |

### Visual / responsive
1. 320px, 375px, 768px, 1280px widths ó no horizontal scroll; nav wraps without overlapping.
2. Zoom 200% ó text not clipped; buttons usable.
3. Forced colors / Windows High Contrast ó borders remain visible.
4. Disable CSS images / check non-color eligibility text.

### Network
1. DevTools Offline ? submit ? offline banner/message, not opaque failure.
2. Throttle Slow 3G ? loading status appears within ~3s; no double publish.

### Cognitive / usability
1. Ask a new faculty user to publish without docs ó if they must paste UUIDs from elsewhere, H3 fails.
2. Confirm plain-language error for wrong password and for forbidden publish.

---

## Summary verdict

**Not yet AA-ready for production academic workflows.** Foundation is solid (skip link, labels on login, focus-visible, alert on several errors). Blockers: **unconfirmed irreversible publish (C1)**, **missing busy/loading patterns (C2)**, **plain-language + rules alert semantics (H1ñH2)**, and **UUID-centric cognitive load (H3)**. Address C/H before calling the curriculum publish or progress workflows accessible.
