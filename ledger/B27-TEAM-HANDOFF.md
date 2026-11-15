# B27 TEAM CHAT — handoff (checkpoint, stopped for quota · 15 Nov 2026)

Branch `wip/b27-team` (from `wip/build27`) · worktree `/root/projects/shark-b27-team` · not merged, not pushed.
Owner-approved mockup: `/root/mockups/team-invite/team2.png` (screens 1–3). `team4.png` (+ menu, group create, group chat, group settings, Lekaa FAB): **group UI and + menu are ON HOLD until the owner approves team4.png**. Group support exists in the data model and API only.

## 🔴 Status: NOT VERIFIED
- **No typecheck has finished** (server typecheck was started, then stopped on the lead's quota order). Mobile `tsc` has not been run.
- **The QC suite `scripts/qc-team-chat.mts` was written but never run.** Parity renders were not done.
- Expect some type errors on the first run. Likely spots: `$queryRaw` with `ANY(${ids})` in `src/lib/team-chat/service.ts`, Prisma relation filter `thread: { tenantId }`, `TeamRow` theme token `c.team.*`, the `I18nKey` cast in `previewOf`, and `[membershipId].tsx` JSX nesting after the CHAT_ONLY edit.

## Done (written)
### Data / migration
- `prisma/schema/team_chat.prisma`: enums `TeamThreadKind {DIRECT, GROUP}` and `TeamThreadRole {ADMIN, MEMBER}`; models `TeamThread` (tenantId, kind, name, photoFileId, createdById, directKey unique per tenant, lastMessageAt), `TeamThreadMember` (threadId+userId unique, role, lastReadAt, muted, joinedAt, leftAt), `TeamMessage` (senderUserId, kind TEXT|SYSTEM, body, attachments Json, editedAt, deletedAt).
- Migration **`prisma/migrations/20261228001000_team_chat/migration.sql`** (additive only). **Applied to the secretary QC DB only** (`.env.qc-sec`, via `scripts/qc-sec.sh pnpm exec prisma migrate deploy`). Not applied to prod.
- `src/lib/core/scope.ts`: the 3 models are registered as `tenant`.
- "Chat only" role = existing `STAFF` with no `true` permission keys and `unitAccess []`. No new Role enum value. See `isChatOnly()` / `roleTagOf()`.

### Server
- `src/lib/team-chat/service.ts`: single writer for the team models.
  - Covers: list, people directory, open DM (deduplicated), create group, get thread, list messages (before/after cursor, `reads`, `read`/`readBy`), send, soft-delete, mark read, mute.
  - `visibleFile`: a file is visible only to a member, and only if it was sent after that member's `joinedAt`.
  - Group admin: rename/photo, add/remove member, set admin, leave (promotes the oldest member if the last admin leaves).
  - Phone lookup: OWNER/MANAGER only, verified phones only, name only in the result, 30/day per user and 100/day per tenant, AuditLog `team.phone.lookup` with a hash instead of the phone.
  - `addByPhone`: creates a chat-only invite through `inviteStaff(..., {channel:"app"})`, with no SMS. AuditLog `team.member.invite`.
  - Attachment ownership: `rememberUpload` / `ownsUpload` (24 h `team-att:` key).
  - Non-member or other tenant ⇒ `null`, which the routes turn into 404.
- `src/lib/team-chat/notify.ts`: per-message push to members who have not muted the thread (link `/secretary/team/<id>` + tenantId + badge), and the invite push (link `/secretary/staff`).
- `src/lib/staff/invite.ts`: `inviteStaff` gained an optional 4th param `{channel:"app"}` that skips SMS and `smsBlocked`. Default behaviour is unchanged.
- `src/lib/ai/secretary/notify.ts`: `badgeTotalFor` now adds `teamUnreadTotal`.
- `src/app/api/mobile/secretary/badges/route.ts`: adds `team.messages`, which is included in `total`.
- `src/app/api/mobile/secretary/staff/route.ts`: the DTO gains `chatOnly`.
- Routes under `src/app/api/mobile/secretary/team/`. All use `gate(req, null)` and are rate-limited:
  - `GET /team`
  - `POST /team/lookup`
  - `POST /team/members`
  - `PUT /team/members/[membershipId]/chat-only` (uses the existing `updateStaffAccess` and its guards)
  - `POST /team/direct`
  - `POST /team/threads` (group)
  - `GET|PATCH /team/threads/[id]`
  - `GET|POST /team/threads/[id]/messages` (clientMessageId dedupe)
  - `DELETE /team/threads/[id]/messages/[messageId]`
  - `POST /team/threads/[id]/read`
  - `POST /team/threads/[id]/members`
  - `DELETE|PUT /team/threads/[id]/members/[userId]`
  - `POST /team/threads/[id]/leave`
  - `GET /team/threads/[id]/files/[fileId]`
  - `POST /team/attachments`
  - Shared helper: `_team.ts`
- The old SMS invite server routes are kept for old app builds (`staff/invite`, `staff/invites*`, `invites/*`).

### Mobile (`apps/mobile`)
- `src/api/team.ts`: API client plus pure helpers (`mergeMsgs`, `readCountOf`, `previewOf`, `listTimeOf`, `msgTimeOf`). `LEKAA_APP_URL = https://apps.apple.com/app/id6793749205`, taken from `ascAppId` in eas.json. **Not verified that the app is public in the store.**
- `src/api/secretary.ts` (small additive edits): PATH `secretary/team/attachments`, `secUpload` overload, `ZoneBadgesRes.team.messages` (counted in the team badge), `StaffRow`/`StaffPerson.chatOnly`.
- `src/components/secretary/SecAttach.tsx`: `useSecAttach` accepts `"secretary/team/attachments"`.
- `src/lib/push-register.ts`: deep links `/secretary/team/<id>` and `/secretary/staff`.
- `src/components/secretary/SecTopBar.tsx`: one line; `PLUS.team` path changed to `/secretary/team/add`. The team screen passes `showPlus={false}`.
- Theme: `team` token added to `src/theme/light.ts` and `dark.ts`.
- i18n: `team.*`, `perm.role.CHAT_ONLY` and `perm.chatOnlyNote` added to th and en, inserted after `sec.staff.add.removeErr`.
- New components:
  - `src/components/team/TeamRow.tsx`: row, TagChip, GroupAvatar.
  - `src/components/team/TeamBubble.tsx`.
  - `src/components/team/layout.ts`: `TEAM_COMPOSER` sizes.
- `app/(app)/secretary/staff/index.tsx`: **rewritten** as the WhatsApp-style team list.
  - Search "ค้นหาคนในทีม" with a round black + (OWNER/MANAGER).
  - Rows in order: threads, then people not yet chatted with, then pending invites (greyed; tap = cancel invite).
  - `ReceivedInvites` banner; poll every 15 s.
- `app/(app)/secretary/team/add.tsx`: add by phone.
  - Auto-lookup at 10 digits; found card shows "✓ ใช้ Lekaa อยู่แล้ว" and the "เพิ่มเข้าทีม" button.
  - Not found shows the message plus "ส่งลิงก์ดาวน์โหลดแอป" (RN `Share`).
  - **The contacts picker is not shown: `expo-contacts` is not installed** (native module; the lead must decide).
- `app/(app)/secretary/team/[id]/index.tsx`: chat room.
  - Header: back, avatar + name left-aligned, role underneath.
  - ⚙ (OWNER/MANAGER, DM only) opens `/secretary/staff/<membershipId>`.
  - Tap on the name opens a sheet with mute/unmute.
  - Poll `after=` every 5 s; mark read; "อ่านแล้ว" / "อ่านแล้ว N".
  - Attach via SecAttach; long-press to delete your own message; optimistic bubble.
- `app/(app)/secretary/staff/[membershipId].tsx`: role segment is now คุยอย่างเดียว / พนักงาน / ผู้จัดการ (manager sees the first 2). Chat-only hides units and the permission grid and saves via `PUT team/members/[id]/chat-only`.
- **Deleted** `app/(app)/secretary/staff/invite.tsx` (SMS invite screen). The `inv.*` i18n keys are left unused.

### Lekaa FAB (other lane: wip/b27-fab)
- In team chat rooms the FAB sits **inline, to the right of the composer, in the same row and at the same height**.
- Composer height 52, FAB 52 including the ring, gap 10, composer right inset 82 from the screen edge. These are exported as `TEAM_COMPOSER` from `src/components/team/layout.ts`.
- The room does not draw its own button. Marker: `TODO(b27-fab)`.
- The team list leaves `TEAM_LIST_FAB_CLEARANCE` (88) of bottom space for the floating FAB.

## Half-done / remaining
1. Run server typecheck and mobile `tsc` and fix errors (commands are in the task brief; one at a time through `iso.sh`).
2. Run `scripts/qc-team-chat.mts` twice. Groups: L/A/C/D/R/G/F/M/S/X.
   - Command: `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-team-chat.mts`
   - Possible fixture issues: `FileAsset` create fields, the `cdnUrl` value, and `inbox/systems` route existence (C-2 tolerates status 0).
3. Regression: `qc-sec-s1.25`, `qc-sec-s1.14b`, `qc-sec-s1.14c` (badges shape now has `team.messages`; check whether that suite asserts exact keys or the exact `total`), and `qc-sec-s2.1`.
   - `qc-sec-s2.1` line 30 lists `secretary/staff/invite.tsx`, which is now deleted. **That suite must be updated deliberately** (replace with `team/add.tsx`).
   - `apps/mobile/qc/buttons-sec.json` also refers to the old staff screens.
4. Parity renders vs team2.png (light + dark) into `/root/qc/b27-team/`: copy `apps/mobile/qc/shoot-help.mjs` to `shoot-team.mjs` with team fixtures; `QC_NODE_MODULES=/root/qc-cal-nm/node_modules`.
5. **ON HOLD (owner approval of team4.png):**
   - The + choice menu ("เพิ่มคนเข้าทีม" / "สร้างกลุ่ม"); today + goes straight to add-person.
   - Group creation screen.
   - Group settings screen (⚙ in a group room). Today groups have no ⚙. The group room itself renders through the same room screen: sender name above bubbles, "อ่านแล้ว N".
6. The pre-commit fitness hook was not run (commit used `--no-verify` if blocked).
7. Unread for a DM thread with no messages is not shown in the list (by design: people without a chat appear as "แตะเพื่อเริ่มแชท").

## Known risks / breakages
- Typecheck and QC have not been run (see the top of this file).
- After a member leaves or is removed and is later re-added, `joinedAt` resets, so they lose history from before re-joining. This is intentional and matches the WhatsApp-like rule.
- The push spam guard is not applied to team messages (one push per message).
- Pending invites from the older SMS flow also show in the team list (greyed). Cancelling them uses the old `DELETE staff/invites/[id]`.
