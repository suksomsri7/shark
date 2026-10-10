# T4.1 — Reject + teach-back D5 (Opus · server + app) — closes MVP 2.0 (CP4)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A9 (stats), R-E C26 first. Contract: AI-TEAM-RUN §2 T4.1. Mockup `airy-d.jpg` page 5 (+ dark). HTML: "ตีกลับงาน · ใบเสนอราคา Q-0012 ฿12,500 · คุณเอก" · "ผิดตรงไหน" chips ราคา/ส่วนลด/ข้อมูลลูกค้า/น้ำเสียง/อื่น ๆ · "บอกคุณเอกเพิ่ม · พิมพ์หรือพูด" textarea · 💡 "คุณเอกเข้าใจว่า … ผมจะแก้ Q-0012 เป็น ฿11,200" · "ให้จำไว้ไหม" segmented เฉพาะงานนี้ / จำเป็นกฎในคู่มือ · rule preview "+ ลูกค้าประจำ (ซื้อเกิน 3 ครั้งต่อปี) ใช้ราคาส่ง · เพิ่มในหัวข้อ ขั้นตอนทำงาน · คู่มือ v3 → v4" · note "สอนครั้งเดียว จำตลอด · ย้อนกลับได้ในประวัติคู่มือ" · button "ส่งกลับให้แก้ + บันทึกกฎ".

## Verified facts
- `rejectProposal(ctx, id)` `proposals.ts:350` (+ T1.9 hunk: `decidedById/decidedAt/resultNote`); `AiTeachNote` (T1.1): `proposalId aiEmployeeId category note proposedRule proposedSection outcome manualVersion createdById`.
- Manual: `createVersion(source: "TEACH")`, `currentManual` (T1.5). Re-run: `sendMessage` in the same `e~` room with the original user text (the first USER message of the room, or the message preceding the proposal — `AiMessage` order) — the model, now with the new manual, produces a new proposal.
- Model call for the rule proposal → `resolveProvider("smart")` + charge with `aiEmployeeId` (X11); mock fixture for `SHARK_AI_MOCK=1` (JSON `{ understanding, ruleText, section }`).

## Deliverables
Server `src/lib/ai/team/teach.ts`: `startTeaching(ctx, userId, proposalId, { category, note }) → { noteId, understanding, proposedRule: { text, section } | null }` (rejects the proposal immediately? **No** — proposal is rejected only at `confirmTeaching`; `startTeaching` only computes; if the user abandons, nothing changes) · `confirmTeaching(ctx, userId, noteId, { remember: "JOB"|"MANUAL", ruleText?, section? }) → { manualVersion?, newConversationState }` — tx: reject proposal (`REJECT:<note>`), write `AiTeachNote.outcome`, MANUAL → `createVersion(TEACH)`; after commit: system message "ตีกลับ: <category> · <note>" + re-run `sendMessage`; audit `ai.teach`. Routes `POST inbox/teach`, `POST inbox/teach/confirm` (+ from the room: same routes with `proposalId`). `AiActionLog{ mode DRAFT, decidedById }` for the reject.
App: `app/(app)/inbox/teach.tsx` (sheet/screen) wired from A5 "ตีกลับ" and A7/D8 "ตีกลับ": category chips · textarea (mic if available) · "💡 เข้าใจว่า" card after `startTeaching` (loading state) · remember segmented · rule preview editable (text + section picker) when MANUAL · submit → `confirmTeaching` → back to the room (new proposal appears).
testIDs `teach-cat-<k>`, `teach-note`, `teach-understanding`, `teach-remember-<k>`, `teach-rule`, `teach-section`, `teach-submit`.

## Files you own
`src/lib/ai/team/teach.ts`, routes, `index.ts`, app screen + components, fixtures, inventory, i18n. Hunk: none in `proposals.ts` (reuse T1.9's reject).

## Acceptance (oracle `qc-ai-t4.1`)
S1 JOB path · S2 MANUAL path: 1 model call charged, v(N+1) with rule in section, note outcome · S3 re-run creates a new PENDING proposal in the same room with a system message · S4 X2/X6 note text cannot change access · S5 permissions / X1 · S6 X3 double confirm → one version · S7 pairs D5 + in-app flow (5 shots) · S8 audit. Regressions T1.5 T1.9 T2.8 `qc-ai-proposals`.

## Controller rulings
- Abandoned teaching (start without confirm) leaves the proposal PENDING and a note row with `outcome = null` — cleaned by T4.5's daily job after 7 days.
- CP4 after acceptance: ask the owner whether to continue T4.2+ or jump to T6.
