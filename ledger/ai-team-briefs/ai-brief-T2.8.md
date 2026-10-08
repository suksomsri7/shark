# T2.8 — Approval inbox A7 (Opus · app lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-E C21 first. Contract: AI-TEAM-RUN §2 T2.8. Mockup `airy-a.jpg` page 7 (+ dark). HTML: title "รออนุมัติ 5 รายการ · ทุกกิจการ ⌄" · pill tabs ทั้งหมด 5 / เงิน 2 / ส่งลูกค้า 2 / โพสต์ 1 · cards: "คุณเอก · The Bean Café · 9:41" · title "ใบเสนอราคา Q-0012 ฿12,500" · subtitle · buttons ดู / แก้ / อนุมัติและส่ง (verb per class) · last card from another tenant "แนน · บลูเฮาส์".

## Data
`GET inbox?tenantId&filter&cursor` (requireMobileUser; rows carry `tenantId`) · `POST inbox/decide` with header `X-Tenant-Id = row.tenantId` (client sets per call — `src/api/team.ts#decideInbox(row, …)`) · `GET summary.pendingApprovals` for the badge on A1.

## Deliverables
`app/(app)/inbox/index.tsx`: tenant chooser (sheet: ทุกกิจการ + each membership) · tabs with counts computed client-side from the full list (ALL fetch, filter locally; server filter used only for pagination) · `InboxCard` (employee orb/name/tenant/time · title · amount · detail line · risk tag chips (i18n) · needsOwner chip · buttons ดู → switch tenant if needed then `/tasks/[conversationId]` · แก้ → `EditProposalSheet` (T2.6) · อนุมัติ… → decide APPROVE (2-step for destructive) · ตีกลับ → reason sheet (T4.1 replaces)) · optimistic removal + undo-toast? **no** (decide is final) · empty "ไม่มีงานรออนุมัติ" · badge update via invalidate("summary").
testIDs `inbox-tenant`, `inbox-tab-<k>`, `inbox-card-<id>`, `inbox-view-<id>`, `inbox-edit-<id>`, `inbox-approve-<id>`, `inbox-reject-<id>`.

## Acceptance (oracle `qc-ai-t2.8`)
S1 pairs (fixture 4 rows, 2 tenants) · S2 filters · S3 decide header equals row tenant · S4 cross-tenant view switches tenant then navigates · S5 counts · S6 empty · S7 testIDs/i18n · typecheck · residue. Regression T2.2.
