# S1.1 — migration `secretary_a` (Opus · lane a/c · `wip/sec-s1.1`) — DRAFT until `sec-brief-RESOLUTIONS.md` exists (controller finalises after S0.1)

Read `sec-brief-COMMON.md` A.6/A.7 first. Plan rows: S1.1 + the tables listed in S1.19 (`UserPhone`), S1.24 (`ChatRoutingRule`, `ChatShift`, `ChatConversationHelper`), S1.25 (invite link), S1.5 (`AiRoomJob`). Only this WO edits `prisma/`.

## Schema (additive · one new file `prisma/schema/secretary.prisma` + nullable columns on existing tables · core.prisma stays FROZEN)
New models (all `tenantId` where tenant-scoped · `createdAt`/`updatedAt` · cuid ids · FKs with `onDelete: Cascade` to the parent row · indexes named in brackets):
- `AiSecretary` — `userId @unique` (→ User) · `name String @default("Shark")` · `suffix String @default("ครับ")` · `tone String @default("polite")` · `languages String[] @default(["th"])` · `prefs Json @default("{}")` (ความชอบจากการเรียนรู้ · ไม่มี PII)
- `AiRoom` — `conversationId @unique` (→ AiConversation) · `tenantId` · `startedById` (User) · `title` · `closedAt DateTime?` · `systems String[] @default([])` · `contextJson Json?` (เช่น {chatConversationId, contactId} สำหรับ S1.22) · `jobsCounted Int @default(1)` · [tenantId, startedById, updatedAt] · [tenantId, closedAt]
- `AiRoomMember` — `roomId` (→ AiRoom) · `userId` · `addedById` · `addedAt` · `seeHistory Boolean @default(false)` · `@@unique([roomId, userId])` · [userId]
- `AiRoomJob` — `roomId` · `messageId` (AiMessage id) · `status String @default("QUEUED")` (QUEUED/RUNNING/DONE/FAILED) · `leaseUntil DateTime?` · `attempts Int @default(0)` · `error String?` · `startedAt/finishedAt?` · `@@unique([messageId])` · [status, leaseUntil] · [roomId, createdAt]
- `AiSystemAccess` — `tenantId` · `module String` · `level String @default("DRAFT")` (OFF/READ/DRAFT) · `setById` · `@@unique([tenantId, module])`
- `AiApprovalRule` — `tenantId` · `key String` · `enabled Boolean @default(true)` · `limitSatang Int?` · `@@unique([tenantId, key])`
- `AiActionLog` — `tenantId` · `roomId?` · `userId` · `approverId?` · `module` · `kind` · `summary` · `payload Json` (ids only) · `proposalId?` · `undoableUntil DateTime?` · `undoneAt DateTime?` · `undoneById?` · [tenantId, createdAt] · [roomId]
- `AiJobCounter` — `tenantId` · `month String` ("YYYY-MM" BKK) · `jobs Int @default(0)` · `@@unique([tenantId, month])`
- `AiLesson` — `tenantId` · `kind` · `pattern String` · `example String` · `status String @default("PENDING")` (PENDING/CONFIRMED/REJECTED) · `occurrences Int @default(1)` · `sourceRoomId?` · `sourceUserId` · `confirmedById?` · [tenantId, kind, status]
- `UserPhone` — `userId @unique` (→ User) · `phone String @unique` (E.164) · `verifiedAt DateTime?` · `inviteCodeHash String?` · `inviteExpiresAt DateTime?` · `invitedByUserId?` · `invitedTenantId?`
- `ChatRoutingRule` — `tenantId` · `systemId` · `channel String?` · `mode String` (ROUND_ROBIN/LAST_ASSIGNEE/OWNER) · `enabled Boolean @default(false)` · `order Int @default(0)` · `@@index([tenantId, systemId, enabled, order])`
- `ChatShift` — `tenantId` · `userId` · `onDutyAt DateTime` · `offDutyAt DateTime?` · `@@index([tenantId, userId, offDutyAt])`
- `ChatConversationHelper` — `tenantId` · `conversationId` (→ ChatConversation) · `userId` · `calledById` · `note String?` · `@@unique([conversationId, userId])` · [userId]
Nullable columns on existing tables (one line each, with a Thai comment pointing to this WO):
- `AiMessage.authorUserId String?` · `AiMemory.status String?` (null = ยืนยันแล้วแบบเดิม · "PENDING" = รอเจ้าของ) · `AiScheduledTask.{ownerUserId String?, frequency String?, days Int[]?, minute Int?, channels String[]?}` · `AiTrainingSample.{outcome String?, editedReply String?, stepsJson Json?, roomId String?}` · `SupportCase.{source String?, category String?}`
Every new model must be registered in the tenant-scope registry (fitness F1 — find the registry the way `svc-brief-r0.1` did) and in `docs/modules/31-secretary.md` M-table.

## Steps
1. Write schema → `prisma format` → `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema --script` → read the SQL yourself (additive only: no DROP/ALTER TYPE/NOT NULL without default) → save as `prisma/migrations/<ts>_secretary_a/migration.sql`.
2. Apply to the secretary QC branch only: `bash scripts/iso.sh bash scripts/qc-sec.sh pnpm exec prisma migrate deploy` → `prisma generate` (writes into the shared node_modules — tell the controller in the report).
3. `pnpm fitness` with env and with `env -u DATABASE_URL`; `pnpm typecheck` (iso, NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M).
4. Oracle `scripts/qc-sec-s1.1.mts` (controller) checks tables/columns/uniques/indexes via `pg`, additivity of the SQL, registry entries, and that `qc-ai-*` baseline is unchanged.

## Files you own
`prisma/schema/secretary.prisma` · the migration folder · the nullable-column lines in `ai.prisma`, `support.prisma` · scope registry entry · `docs/modules/31-secretary.md` §M (table list only).
