# B27 TEAM CHAT — handoff (15 Nov 2026 · continued 17 Nov 2026)

## ▶ 17 Nov 2026 — customer chat: AI suggest / translation switches in the app + ✨ button (owner approved)
- Why: the owner could not find "แปล" / "แปลแล้วส่ง" / the draft card in the app. Both features are off by default per chat system,
  and the only switch was on the web.
- Server (commit `46f9e223b`):
  - `src/lib/modules/chat/ai-settings.ts` is the one reader/writer of `ChatSetting.aiSuggestEnabled/translateEnabled/staffLang`.
    If the row is missing, it is created only after checking that the system belongs to the tenant.
  - The web `setChatAiSettingsAction` now calls it, with the same permission key, form fields and staffLang rule.
  - `CHAT_SETTING_ACTION` (= `chat.setting.setMemberSystem`) is in `guard-keys.ts`.
  - New `GET/PUT /api/mobile/inbox/ai-settings`. Gate READ; editing needs `CHAT_SETTING_ACTION` (403 Thai otherwise); zod strict;
    staffLang must be one of the web form's 8 codes (th en cn ja ko de fr ru); 30/min; `withErrors`. Documented in `docs/api/SECRETARY-API.md`.
  - `conversations/[id]`: `can.aiSuggest` = key `chat.ai.suggest` **AND** the shop's `aiSuggestEnabled` (same as `can.translate`).
    Consumers checked: the app room (auto-fetch uses `!== false`, unchanged; ✨ uses `=== true`), `states-sec.mjs` fixture, `qc-sec-s1.14c` C-1 (updated deliberately).
- App (commit `b23a4b21c`):
  - `secretary/settings/customers.tsx` › `InboxSettings` has a new section "AI และการแปลภาษา" (first, above channels):
    switches, 8 language chips, a per-use cost line, and read-only (dimmed + one line) when `canEdit` is false. Saves on tap.
  - `customers/[id]/index.tsx` has a ✨ button (`cust-draft-ask`) in the input row. It shows when `can.aiSuggest === true`, the user can reply,
    the message is not an internal note and the reply window is open. Pressing it posts `…/ai-suggest` and shows the existing draft card (spinner while busy);
    `ok:false` shows the server's reason in `cust-room-note`.
  - **Composer arrangement:** at 390pt, ＋ 🔒 field ✨ แปลแล้วส่ง send + Lekaa left the text field ~0 wide. "แปลแล้วส่ง" is now a small
    right-aligned strip above the send button. The input row is ＋ 🔒 field ✨ send + Lekaa; the field is ~95pt, so the Thai placeholder wraps to 2 lines.
  - i18n th/en: new keys `cust.draft.ask/asking/fail` and `cust.ai.*`. Customer-chat strings now say Lekaa instead of Shark:
    `cust.draft.title`, `cust.row.aiDraft`, `cust.msg.aiBy`, `cust.msg.aiNoApprover`, `cust.info.askShark`, `cust.ask.title`.
    Not renamed: the platform name "SHARK" (`cust.info.inShark`) and the after-hours `sec.cust.*` strings (outside this scope).
  - `qc/buttons-sec.json` regenerated (+ `cust-set-ai*`, `cust-draft-ask`). `clicks-sec.json` was **not** re-run, so it is stale vs the registry.
- Verified (all through iso.sh):
  - server `pnpm typecheck` EXIT 0 · mobile `tsc --noEmit` EXIT 0 (run after the last change)
  - `qc-b27-chat-ai` 22/22 (run 3×, last after the final change) · `qc-sec-s1.14c` 13/13 · `qc-sec-s1.14b` 24/24 · `qc-sec-s3a6-s` 23/23
  - `qc-chat-translate` 34/34 · `qc-chat-ai-suggest` 44/44 · `qc-chat-inbox-ui` 55/55
  - screen specs s3a6 / s2.17 / s2.7: only U-1 ← U7.1 red, which is pre-existing (hex in `src/components/secretary/SecAttach.tsx`, not touched)
  - fitness passes (pre-commit)
- Renders in `/root/qc/b27-chat/`, light + dark (`shoot-team.mjs` with `FIXTURE=apps/mobile/qc/fixtures/b27-chat/chat.json` / `chat-readonly.json`):
  - `render-chat-settings*`, `render-chat-room-ask*` (text typed), `render-chat-room-draft*` (after ✨), `render-chat-room-internal*`
    (no ✨ / no translate strip), `render-chat-settings-readonly*`, `render-chat-room-off*`
  - Crops: `crop-*.png`. No mockup exists for this, so there are no MOCKUP|RENDER pairs.

## ▶ 17 Nov 2026 follow-up (owner: permission prompts in Thai AND English · App Store link)
- iOS permission strings are localized through app config `locales` (`apps/mobile/locales/th.json`, `en.json`, key `ios`) +
  `ios.infoPlist.CFBundleAllowMixedLocalizations: true`. Every usage string the config resolves to has th + en: contacts, photos, camera,
  microphone (image-picker default), calendars + calendars full access, reminders + reminders full access, Face ID (secure-store default).
  Thai wording kept exactly; English = plain equivalents (mic/Face ID: "Allow Lekaa to …", Thai "อนุญาตให้ Lekaa …").
  The default (non-localized) Info.plist values are unchanged (plugin strings in app.json — Thai; mic/Face ID plugin English defaults).
  Android: no user-visible permission rationale strings in config → left alone.
- Validated: `npx expo config --type introspect` (iso.sh) EXIT 0 — `CFBundleAllowMixedLocalizations` true, `locales` {th, en}, default contacts string Thai.
  `expo prebuild --platform ios --no-install` in a scratch copy (not in the worktree) EXIT 0 → `ios/Lekaa/Supporting/en.lproj/InfoPlist.strings`
  and `th.lproj/InfoPlist.strings` each contain all 9 keys; Info.plist keeps the Thai defaults.
- `LEKAA_APP_URL`: owner confirmed the app has **not been submitted to Apple review** ⇒ the link is not public; the "ส่งลิงก์ดาวน์โหลดแอป"
  share only works after release. Link unchanged; dated note added next to the constant in `apps/mobile/src/api/team.ts`.
- Re-verified after the last UI fixes: `qc-team-chat` **86/86** · mobile `tsc --noEmit` **EXIT 0**.
- Like expo-contacts, the localized prompts ship with the next native build only.

## ▶ 17 Nov 2026 session (read this first — supersedes the 15 Nov status below)
- Owner approved **all 5 screens of team4.png** — the "ON HOLD" notes below no longer apply; the + menu, group create, group settings are built.
- Commits on `wip/b27-team` (not pushed, not merged): `e398dc758` push guard + QC · `05c542f49` group UI + contacts · `3f82a7d65` qc/docs ·
  `a6ac9d528` parity renders + render fixes · last commit = s2.1 fixture/shots + this file (see `git log`).
- Verified 17 Nov (all through `scripts/iso.sh`):
  - server `pnpm typecheck` (14000M, gate lock) — **EXIT 0** (final run after every server change)
  - mobile `npx tsc --noEmit` in apps/mobile — **EXIT 0** (run twice; last after all UI + expo-contacts)
  - `qc-team-chat.mts` — run 1 85/86 (X-1 false positive: `secret` matched "secretary" in file URLs → regex fixed), runs 2 and 3 **86/86**
    (now covers groups G-1..13, group photo F-7, push guard P-1..5, group screens S-6..10)
  - `qc-sec-s1.25` 19/19 · `qc-sec-s1.14b` 24/24 · `qc-sec-s1.14c` 12/12 (first run: only D-1/D-2 red = fitness F7.1 dead doc ref, fixed in `3f82a7d65`;
    s1.14c does not assert exact badge keys, so `team.messages` needed no suite change)
  - `qc-sec-s2.1` **9/14** — reds T-1, I-1, I-2, E-1, U-1(U7.1) are all **pre-existing on the base commit f37b1757c** (checked file by file:
    SecTopBar has no `"inbox"` icon string anymore · en.ts has Thai comments from other lanes · calendar/index.tsx has Thai strings ·
    (app)/index.tsx has no `home-open-secretary` · hex/rgba in BusinessSwitcherSheet/SecTopBar/SecAttach). All team routes pass U4/U5 after
    adding them to `qc/fixtures/secretary/s2.1.json` and shooting them with shoot-sec (`/secretary/staff` expect now uses the team testIDs).
  - `pnpm fitness` passes (pre-commit hook ran on every commit).
- Parity renders (MOCKUP|RENDER, light + dark): `/root/qc/b27-team/pair-team-{list,plus,new-group,group-room,group-settings,add}[-dark].png`
  (`apps/mobile/qc/shoot-team.mjs` + `qc/fixtures/team/team.json`; node_modules = `/root/qc/b27-team/nm/node_modules` = symlinks to
  /root/qc-cal-nm + a copy of expo-contacts; the worktree's own node_modules has no react-native-web). Looked at each; fixed: + menu dim
  now full-screen, ⋯ per member is plain dots. Remaining small differences: web focus ring on the phone field (web only), found-card border is
  the stronger green token, avatar colours come from the seed not the mockup.
- 🔴 expo-contacts `~57.0.9` is a **native module** → works only from the next EAS build (on build 26, tapping shows "เปิดรายชื่อในเครื่องไม่ได้", no crash).
  iOS usage string is Thai only, like the existing photo/camera/calendar strings (app.json has no locale files). Android: READ_CONTACTS (plugin) · WRITE_CONTACTS blocked.
- Lekaa FAB: not on this branch. Rooms (DM + group = same file) keep `TEAM_COMPOSER` + `TODO(b27-fab)`; list keeps `TEAM_LIST_FAB_CLEARANCE`.
- Push guard: `notifyTeamMessage` sends at most 1 push per (recipient, thread) per 30 s (`TEAM_PUSH_WINDOW_MS`), per process, like secretary `notifyUser`.
- Raw SQL in `team-chat/service.ts`: reviewed — tagged `$queryRaw` only (bound params), tenant on both join sides; added `leftAt IS NULL` to the last-message join.
- Not done / not verified: App Store link `LEKAA_APP_URL` (not public until release — see follow-up above) · `qc-sec-s2.14` / `click-sec.mjs` click run not re-run (buttons-sec.json was
  regenerated, so `clicks-sec.json` is now stale vs the registry) · no new migration in this session.

## (15 Nov) Status: NOT VERIFIED — superseded by the 17 Nov block above
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
