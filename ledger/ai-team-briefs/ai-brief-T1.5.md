# T1.5 — Manual (6 sections) · versions · injection into the prompt (Opus · server lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A11, R-E C13 first. Contract: AI-TEAM-RUN §2 T1.5. Mockups B3 (6 cards), B4 (forbidden list editor + suggestions + "if the customer asks for a forbidden thing, reply…" + notify switch), B8 (history), D5 (teach-back adds a rule — T4.1).

## Verified facts
- `AiEmployeeManual(aiEmployeeId, version, sectionsJson, note, editedById, source, createdAt)` unique `(aiEmployeeId, version)` (T1.1).
- Private file route from CRM C0.4: find it (`grep -rn "private" src/app/api/files src/lib/files` — the HMAC 15-min link route and `uploadFile` private mode); reuse for SOP attachments; text extraction: check what the KB/chat modules already use for PDF/docx text (grep `pdf-parse|mammoth|extractText`); if nothing exists, accept `.txt/.md/.pdf` with a minimal PDF text extraction via an existing dependency only — otherwise store the file and mark `extracted: false` (notes).
- Model calls for `draftManualFromText` go through `resolveProvider("smart")` `provider.ts:210` + `chargeUsageSafe` with `aiEmployeeId` (X11); with `SHARK_AI_MOCK=1` the MockProvider must return a parsable JSON (write the mock fixture in the oracle via `SHARK_AI_MOCK_REPLY` if such a hook exists — check `provider.ts:95`; if not, add an env hook `SHARK_AI_MOCK_FILE` to MockProvider as a small hunk, documented).

## Deliverables (`src/lib/ai/team/manual.ts`)
- `MANUAL_SECTIONS = ["duties","forbidden","askWhen","steps","goodExamples","metrics"] as const`; `type Manual6 = Record<Section, { text: string; items?: string[] }>` + `forbidden` carries `{ items: string[], replyWhenAsked: string, notifyOwner: boolean }` (B4); zod with caps: text ≤ 2,000 chars, items ≤ 20 × 200 chars, control chars stripped, no HTML.
- `createVersion(ctx, aiEmployeeId, { sections, note, source: "HIRE"|"EDIT"|"TEACH"|"REVERT" }) → { version }` — single tx: `SELECT max(version) … FOR UPDATE` on the employee row (advisory lock `ai-manual-<id>`) then insert `max+1`; audit `ai.manual.version`.
- `currentManual(aiEmployeeId)` · `listVersions(ctx, id) → { version, createdAt, editedBy { id, name }, note, source, changedSections[] }[]` · `diffVersions(a, b) → { section, kind: "added"|"removed"|"changed", before, after }[]` · `revertTo(ctx, id, version, { confirm: true })` → new version copying the old sections, source REVERT, note "ย้อนกลับไปใช้ v<n>".
- `draftManualFromText(ctx, id, text) → Manual6` — English prompt asking the model to split the owner's spoken/typed description into the 6 sections (JSON), charged to the employee, **not persisted**; refuses text > 8,000 chars.
- `attachDocument(ctx, id, { fileRef, filename, mime }) → { attachmentId, extractedChars }` — allowlist mime pdf/txt/md/docx, ≤ 10 MB; stores `AiManualAttachment`? → **no new table**: store under `sectionsJson.attachments[]` of the next version `{ fileRef, filename, extractedText ≤ 20,000 }` (the file itself stays in the private store; DTOs expose only `filename` + a short-lived link from the existing route).
- Prompt injection (T1.4's `buildEmployeePrompt`): manual text goes into the `<<<SHOP_MANUAL>>>` data block; `forbidden.replyWhenAsked` becomes an instruction line ("When asked for a forbidden thing, answer exactly: …") — the only manual field promoted to an instruction, and it is quoted as a string literal.
- Suggestions for B4 ("แนะนำจากร้านแบบเดียวกัน"): static list per template category in `templates.ts` (`forbiddenSuggestions`), no DB.

## Files you own
`src/lib/ai/team/manual.ts`, `templates.ts` (suggestions export), hunk in `persona-prompt.ts` (manual block), optional MockProvider hook hunk in `provider.ts` (documented).

## Acceptance (oracle `qc-ai-t1.5`)
S1 version flow + diff · S2 X3 10 parallel createVersion → 2..11 · S3 revert + confirm · S4 caps · S5 X6 injection text in manual → no level change, tool list unchanged, out-of-level execute refused · S6 draft charges once, not persisted · S7 attachment rules + no permanent URL · S8 X1 · S9 audit · residue. Regressions: `qc-ai-tools` `qc-ai-memory`.

## Controller rulings
- Versions are never deleted or edited in place (append-only); `listVersions` is paginated by 20.
- `replyWhenAsked` max 300 chars; shown verbatim to the model and to the owner.
