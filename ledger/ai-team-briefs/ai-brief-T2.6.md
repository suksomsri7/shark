# T2.6 — Task room A5 (Opus · app lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-E C20 first. Contract: AI-TEAM-RUN §2 T2.6. Mockup `airy-a.jpg` page 5 (+ dark). HTML: header (back · "ใบเสนอราคา ร้านดอยช้าง" · "คุณเอก · The Bean Café" · avatar stack) · user bubble · step card (✓ พบลูกค้าใน CRM · ✓ ดึงราคาสินค้า 2 รายการ · ✓ ส่วนลด 5% อยู่ในนโยบาย · ● รอคุณอนุมัติก่อนส่ง) · approval card ("รออนุมัติ" label · title "ใบเสนอราคา Q-0012 ฿12,500" · subtitle · 2 line items · buttons "แก้" "อนุมัติและส่ง LINE") · assistant text · composer "สั่งงานต่อในงานนี้…".

## Verified facts (REVIEW §4.1/4.2)
- `app/(app)/chat/[id].tsx` (462): bubbles, `ProposalCard` (`src/components/chat/ProposalCard.tsx` — `ProposalView {id, summary, risk, resolved?, note?}`, props `{proposal, busy, armed, onConfirm, onReject}`, DESTRUCTIVE = red 2-step), image attach ≤ 2 MB, SSE via `sendChat(input, onEvent)` (`src/api/client.ts`) events `status/done/error`, chips from welcome. Proposals via `GET /api/mobile/proposals?conversationId=`, confirm/reject via `POST proposals/confirm|reject`; plans via `plans/confirm|reject` (routes exist, unused by the app).
- Messages `GET conversations/[id]/messages`; read marker `POST conversations/[id]/read`.

## Deliverables
`app/(app)/tasks/[id].tsx` — reuse the chat machinery by extracting shared hooks from `chat/[id].tsx` into `src/lib/chat-room.ts` (`useRoomMessages`, `useSendMessage`, `useProposals`) **without changing `chat/[id].tsx` behaviour** (it imports the hooks; its shots stay identical) · `StepCard` (built from SSE `status` labels + a final state; persisted steps = the assistant message's leading "✓" lines if the server emits them — else render from the live stream only and note) · `ProposalCardV2` (theme tokens; verb by `classOfKind` from the inbox DTO: `อนุมัติและส่ง LINE` for customerFacing chat kinds, `อนุมัติและโพสต์`, `อนุมัติและตอบ`, else `อนุมัติ`; DESTRUCTIVE keeps the 2-step red; "แก้" opens an edit sheet for supported kinds (`amountSatang`, `text`) → `POST inbox/decide { edits }`; "ตีกลับ" → reject with reason ≥ 5 chars (T4.1 replaces with the teach flow)) · `PlanCard` (steps list · confirm/reject via `plans/*`) · composer · menu ⋯ (เสร็จ / เก็บ → `POST tasks/[id]/done|archive`) · first message from `router` params shown optimistically.
testIDs: `room-step-card`, `room-proposal-<id>`, `room-approve-<id>`, `room-edit-<id>`, `room-reject-<id>`, `room-plan-<id>`, `room-input`, `room-send`, `room-menu`, `room-done`, `room-archive`.

## Files you own
`app/(app)/tasks/[id].tsx`, `src/lib/chat-room.ts` (extracted), `src/components/team/{StepCard,ProposalCardV2,PlanCard,EditProposalSheet}.tsx`, hunk in `app/(app)/chat/[id].tsx` (import hooks only), fixtures `t2.6.json` (messages + 1 account proposal + 1 plan), inventory, i18n.

## Acceptance (oracle `qc-ai-t2.6`)
S1 pairs · S2 verbs by class + destructive 2-step · S3 approve/reject calls + card state · S4 PlanCard confirm/reject through `plans/*` · S5 SSE status → steps, error → Thai text · S6 menu actions · S7 `chat/[id]` shots unchanged · S8 testIDs/i18n · typecheck · residue. Regression `qc-mobile-chat`.

## Controller rulings
- Legacy rooms (`/chat/[id]`) are not restyled in this WO (T6.3 debt list).
- Approval verb map lives in `src/i18n/team.ts` keyed by class, not by kind string.
