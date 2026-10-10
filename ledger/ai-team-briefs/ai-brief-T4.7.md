# T4.7 — Manual history polish: diffs · effect badge · export (Sonnet allowed)
Read `ai-brief-COMMON.md` first. Contract: AI-TEAM-RUN §2 T4.7. Mockup `airy-b.jpg` page 8 (B8) — the "📈 หลังแก้ ผ่านโดยไม่ต้องแก้ 88% → 94%" line and the per-version diff line ("+ ห้ามให้ส่วนลดเกิน 10% โดยไม่ถามก่อน", "น้ำเสียง: เป็นกันเอง → สุภาพ").

## Verified facts
- `manual.ts#diffVersions` (T1.5) returns section-level changes; `listVersions` DTO has `changedSections`, `effect: null` (T2.10 hides the badge when null).
- `AiEmployeeDaily` (T4.5) gives approved/edited/rejected per day; version timestamps from `AiEmployeeManual.createdAt`.

## Deliverables
- `manual.ts#versionEffect(aiEmployeeId, version) → { before: pct, after: pct } | null` — window = 20 decided tasks before the version's createdAt and 20 after (from `AiActionLog`/daily rows, not calendar days); null if either side < 20 (R: "≥ 20 งานทั้งสองช่วง"); cached in the DTO per request.
- Item-level diff for list sections (added/removed items) and a short Thai summary line per version (`+ <item>` / `− <item>` / `<section>: <before> → <after>` for persona-like scalar fields stored in the manual? — persona is not in the manual; the mockup's "น้ำเสียง" line comes from persona changes: record persona changes as manual versions? **Ruling: no** — persona edits are audited separately; B8 shows only manual content diffs (note the deviation from the mockup in wo-notes).
- `exportManualText(ctx, id) → string` (6 sections, Thai display) + route `GET employees/[id]/manual/export` (text/plain) + share sheet in the app.
- App B8: diff lines, 📈 badge when `effect`, export button in ⋯.

## Acceptance (oracle `qc-ai-t4.7`)
S1 diffs added/removed/changed · S2 effect shown at 20/20, hidden at 19 · S3 export text contains all six sections · S4 revert from the screen → new version + shot · S5 pairs B8 light/dark · testIDs/i18n. Regressions T1.5 T2.10 T4.5.
