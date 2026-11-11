# S1.1 — migration `secretary_a` (Opus · lane a/c · `wip/sec-s1.1`) — FINAL 4 พ.ย. (หลัง RESOLUTIONS)

Read `sec-brief-COMMON.md` A.6/A.7 first, then `sec-brief-RESOLUTIONS.md` (R-K1 R-K2 R-K5 R-K9/K10 R-K11 R-K12 R-K20 · §B.1 §B.4 · §D). Plan rows: S1.1 + tables of S1.19/S1.24/S1.25/S1.5/S1.23. Only this WO edits `prisma/`. Keep §4 of `docs/modules/31-secretary.md` (S0.3) in sync — if S0.3 has merged first, copy its §4 table; if not, this brief is the source and S0.3 copies from here (the two must be identical at CP0).

## Schema (additive · one new file `prisma/schema/secretary.prisma` + nullable columns on existing tables · `core.prisma` stays FROZEN — no `User.phone`)
All new models: cuid `id` · `createdAt @default(now())` · `updatedAt @updatedAt` where rows change · `tenantId` on tenant-scoped rows · FKs `onDelete: Cascade` to the parent row (`AiRoom`→`AiConversation`, `AiRoomMember`/`AiRoomJob`→`AiRoom`, `ChatConversationHelper`→`ChatConversation`) · indexes in brackets.

Tenant axis:
- `AiRoom` — `conversationId @unique` · `tenantId` · `startedById String` (= `conversationCreatorOf(conversationId).id` · denormalized · R-K1) · `title String` · `closedAt DateTime?` · `systems String[] @default([])` · `contextJson Json?` ({chatConversationId, contactId} for S1.22) · `jobsCounted Int @default(1)` · [tenantId, startedById, updatedAt] · [tenantId, closedAt]
- `AiRoomMember` — `roomId` · `userId` · `addedById` · `addedAt @default(now())` · `seeHistory Boolean @default(false)` · `@@unique([roomId, userId])` · [userId]
- `AiRoomJob` — `roomId` · `messageId String @unique` (AiMessage id) · `authorUserId String?` · `status String @default("QUEUED")` (QUEUED/RUNNING/DONE/FAILED) · `leaseUntil DateTime?` · `attempts Int @default(0)` · `error String?` · `startedAt DateTime?` · `finishedAt DateTime?` · [status, leaseUntil] · [roomId, createdAt]
- `AiSystemAccess` — `tenantId` · `module String` · `level String @default("DRAFT")` (OFF/READ/DRAFT) · `setById String` · `@@unique([tenantId, module])`
- `AiApprovalRule` — `tenantId` · `key String` (`chat.send` | `money.limit` | `pii.export` — R-K3) · `enabled Boolean @default(true)` · `limitSatang Int?` · `setById String` · `@@unique([tenantId, key])`
- `AiActionLog` — `tenantId` · `roomId String?` · `userId String` · `approverId String?` · `module String` · `kind String` · `summary String` · `payload Json` (ids only · no PII) · `proposalId String?` · `entityType String?` · `entityId String?` · `undoableUntil DateTime?` · `undoneAt DateTime?` · `undoneById String?` · [tenantId, createdAt] · [roomId] · [proposalId]
- `AiJobCounter` — `tenantId` · `month String` ("YYYY-MM" BKK via `monthKeyBangkok`) · `jobs Int @default(0)` · `@@unique([tenantId, month])`
- `AiLesson` — `tenantId` · `kind String` · `pattern String` · `example String` · `status String @default("PENDING")` (PENDING/CONFIRMED/REJECTED) · `occurrences Int @default(1)` · `sourceRoomId String?` · `sourceUserId String` · `confirmedById String?` · [tenantId, kind, status]
- `StaffInvite` (R-K11) — `tenantId` · `phone String` (E.164) · `name String` · `role String` (MANAGER/STAFF) · `unitAccess Json @default("[]")` · `permissions Json @default("{}")` · `codeHash String @unique` · `expiresAt DateTime` · `acceptedAt DateTime?` · `acceptedUserId String?` · `invitedById String` · [tenantId, phone] · [tenantId, acceptedAt]
- `ChatRoutingRule` — `tenantId` · `systemId String` · `channel String?` · `mode String` (ROUND_ROBIN/LAST_ASSIGNEE/OWNER) · `enabled Boolean @default(false)` · `order Int @default(0)` · `@@index([tenantId, systemId, enabled, order])`
- `ChatShift` — `tenantId` · `userId` · `onDutyAt DateTime` · `offDutyAt DateTime?` · `@@index([tenantId, userId, offDutyAt])`
- `ChatConversationHelper` — `tenantId` · `conversationId` (→ ChatConversation) · `userId` · `calledById` · `note String?` · `@@unique([conversationId, userId])` · [userId]

Global axis (`g(...)` in `scope.ts` like `PushDevice` — §B.1):
- `AiSecretary` — `userId @unique` (→ User · Cascade) · `name String @default("Shark")` · `suffix String @default("ครับ")` · `tone String @default("polite")` · `languages String[] @default(["th"])` · `prefs Json @default("{}")` (no PII)
- `UserPhone` — `userId @unique` (→ User · Cascade) · `phone String @unique` (E.164) · `verifiedAt DateTime?`
- `PhoneOtp` (R-K9) — `phone String` · `codeHash String` · `expiresAt DateTime` · `consumedAt DateTime?` · `attempts Int @default(0)` · `ip String?` · [phone, createdAt] · [expiresAt]
- `AiNotifyPref` (R-K20) — `userId` · `tenantId String?` · `kind String` (inbox/approval/room/help) · `mode String` (ALL/ASSIGNED/OFF) · `@@unique([userId, tenantId, kind])`

Nullable columns on existing tables (one line each · Thai comment `// S1.1 เลขา AI`):
- `AiMessage.authorUserId String?` (R-K2)
- `AiMemory.status String?` (null = ยืนยันแล้วแบบเดิม · "PENDING" = รอเจ้าของ)
- `AiScheduledTask.{ownerUserId String?, frequency String?, days Int[] @default([]), channels String[] @default([])}` — **no `minute`** (R-K5/K8)
- `AiTrainingSample.{outcome String?, editedReply String?, stepsJson Json?, roomId String?, proposalId String?}` (§B.4)
- `SupportCase.{source String?, category String?, roomId String?}` (R-K12)

Every new model must be registered in `src/lib/core/scope.ts` (fitness F1 CRITICAL) with the axis above, and listed in `docs/modules/31-secretary.md` §4 M-table.

## Steps
1. Write schema → `pnpm exec prisma format` → `pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema --shadow-database-url "$DIRECT_URL" --script` (through `qc-sec.sh`) → read the SQL yourself (additive only: no DROP · no ALTER TYPE · no NOT NULL without default) → save as `prisma/migrations/<ts>_secretary_a/migration.sql`.
2. Apply to the secretary QC branch only: `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy` → `pnpm exec prisma generate` (writes into the shared node_modules — say so in the report so lanes b/c re-generate before typecheck).
3. `pnpm fitness` with env and with `env -u DATABASE_URL -u DIRECT_URL`; `pnpm typecheck` (iso · `NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M`).
4. Re-run `bash scripts/sec-baseline.sh` (all 60 suites) — must equal `ledger/qc-baseline/sec-baseline-2c2062c7.txt`. Paste the diff (expected: none) in the report.
5. Oracle `scripts/qc-sec-s1.1.mts` (controller) checks tables/columns/uniques/indexes via `pg`, additivity of the SQL, registry entries + axis, and the baseline.

## Files you own
`prisma/schema/secretary.prisma` · the migration folder · the nullable-column lines in `ai.prisma`, `support.prisma` · `src/lib/core/scope.ts` entries · `docs/modules/31-secretary.md` §4 (table list only, if S0.3 merged first). Nothing in `src/lib/ai/**` (S1.2+ do the code).
