# B27-FAB — Lekaa floating button + Lekaa sheet + page context (handoff · checkpoint 15 Nov 2026)

Branch `wip/b27-fab` (worktree /root/projects/shark-b27-fab). Resumed 17 Nov 2026 (Job A = items below + Job B = topbar2). See the **17 Nov session** block at the end for the current state.
Mockups: /root/mockups/lekaa-fab/fab6.png (screens 1–3), fab4.png screen 3, /root/mockups/team-invite/team4.png screen 4 (inline FAB beside the composer).

## Migration
- `prisma/migrations/20261228000800_lekaa_fab/migration.sql` adds `AiRoom.pageContext JSONB` and `AiRoom.hiddenAt TIMESTAMP(3)` (IF NOT EXISTS). The schema is in `prisma/schema/secretary.prisma`.
- **Already applied to the secretary QC DB** (`bash scripts/qc-sec.sh pnpm exec prisma migrate deploy`). Not applied to prod. `prisma generate` was run.

## Done (written, not yet typechecked)
### Server
- `src/lib/ai/secretary/page-context.ts` (new). It cleans the page context and re-resolves the entity with the caller's permissions: ACCOUNT_DOC/CRM_CONTACT/CRM_DEAL/KANBAN_CARD via `calendar/links.resolveLink`; MEMBER, BOOKING_APPT (unit access), CHAT (`visibleCustomerConversation`), STAFF and CAL_DAY directly. The label is always built on the server.
  It also holds the state machine PENDING/ASKED/CONFIRMED/REJECTED + `askId` + `refIds`, the prompt block (`pageContextPromptBlock`), the marker parser `applyPageMarkers` (⟦ref⟧ ⟦ask⟧), `answerPageContext` and `pageContextDto`.
- `rooms.ts`:
  - `startRoom` takes `pageContext` (resolved before the tx and stored).
  - `listRooms` always uses "mine" and leaves out hidden rooms.
  - `canSeeRoom` and `managedRoom` no longer give OWNER access to other people's rooms.
  - New `hideRoom`: soft delete by the creator only. It sets hiddenAt, closes the room, and marks the room's PENDING proposals and plans REJECTED.
  - `recentDuplicateRoom` skips hidden rooms.
- `conversations.ts`:
  - Room-reading paths no longer give OWNER `tenantRooms`, and hidden rooms are invisible.
  - `canConfirmerSeeConversation` (the approver path) keeps OWNER, so the inbox and approve still work.
  - New `canActOnApproval`, now used by `rejectProposal`, `rejectPlan` and `teach.visibleProposal` (reject and edit from the inbox).
  - `views.proposalApprovableBy` has a fallback for approvers who cannot read the room.
- `members.ts`: OWNER removed from visibleRoom and canManage. `addMember` is blocked (`ADD_MEMBER_DISABLED`, 403 forbidden with a Thai message). Existing member rows are kept.
- `dto.ts`:
  - `roomDto` now has `pageContext` and `canAddMembers:false`; `canManage` is the creator only.
  - The inbox DTO has `canOpenRoom`, computed in `inbox.ts` from `canSeeConversationById`.
- `persona.ts`: new `pageContext` block. `service.ts` injects the block for secretary rooms. It also strips markers and updates `AiRoom.pageContext` in the same persist tx. The assistant message id comes from `randomUUID()` so `askId`/`refIds` can point at it.
- Routes:
  - `POST secretary/rooms`: accepts `pageContext` (zod) and ignores `scope`.
  - New `DELETE secretary/rooms/[id]`: creator only, soft hide.
  - New `POST secretary/rooms/[id]/page-context {answer: yes|no}`: conditional state update, then sends "ใช่ <label>"/"ไม่ใช่" via `sendRoomMessage` and runs the job in `after()`.
- Web:
  - `src/lib/ui/page-context.ts` (new): `entityFromPath` derives the entity for account docs, CRM contact/deal, member detail and kanban `?card=`. `usePageEntity` covers entities the path cannot show.
  - `AppShell.tsx` posts `{ev:"page-context",…}` on each navigation, in-app only.
  - `CalendarBoard.tsx` registers the open booking appointment as the page entity.

### Mobile
- `src/components/lekaa/`:
  - `LekaaLogo.tsx`: static logo.
  - `core.tsx`: context, constants and per-screen API: `useLekaaFabOffset`, `useLekaaFabHidden`, `useLekaaPageContext`, `useLekaaSuppress`, `LekaaFabSlot` (inline, size = `size.inputH`), `routeContext`.
  - `LekaaFab.tsx`: `LekaaFabHost`, which shows the floating 62px button with the approvals badge, captures the page context when the button is tapped, and hides the button when a sheet or slot is open or the route is in the hide list.
  - `LekaaSheet.tsx`: list with search + black + button, chips, RoomCards, swipe-to-delete with a confirm step, drag to full height. Room view and new task both open inside the sheet. New task posts `pageContext`.
- `(app)/_layout.tsx` wraps the Drawer in `LekaaFabHost`. `app/_layout.tsx` now lands on "/" (was /secretary).
- `SecTopBar.tsx`: the secretary icon is removed and the secretary zone has no `+`.
- `secretary/index.tsx`: the scope toggle is removed and there is no `+`.
- `inbox.tsx`: when `canOpenRoom` is false, tapping a row shows a note and does not open the room.
- `RoomView.tsx`:
  - `embedded` mode for the sheet.
  - CONTEXT_CONFIRM card (`ContextConfirm.tsx`) and 📍 ref chip (`Bubble` `footer`).
  - Add-member entry points removed (`canAdd=false`).
  - `LekaaFabSlot` sits in the same row as the composer (`inputRow`).
- `airy/Sheet.tsx` calls `useLekaaSuppress(visible)`.
- `secretary.ts` API: `PageContext` and `RoomPageContext` types, the `page-context` path, `DELETE rooms/[id]`, and `canOpenRoom` on inbox rows.
- i18n `lekaa.*`, `sec.ctx.*`, `sec.inbox.notYours` added to both th and en. Theme `lekaa.*` palette keys added to both light and dark.

## Half-done / remaining
1. **Dashboard WebView `app/(app)/index.tsx` is not wired.** Its onMessage must handle `d.ev === "page-context"`, keep the context in state, and call `useLekaaPageContext(ctx)` (with `system`, `systemId`, `path`, `title`, `entity`). Until then the host falls back to `routeContext("/")` = "หน้าหลักร้าน" with no entity.
2. **Inline slot is not yet on the other chat screens.** Add `<LekaaFabSlot/>` in a row with the composer in `secretary/new.tsx`, `customers/[id]/index.tsx` and `secretary/help/[caseId].tsx`. The team chat lane only needs `LekaaFabSlot`, `useLekaaFabOffset` or `useLekaaFabHidden` from `@/src/components/lekaa/core` (documented in that file's header). `/chat/[id]` (1.0) is in the hide list.
3. Calendar screen: could call `useLekaaPageContext({route:"secretary/calendar", entity:{type:"CAL_DAY", id:<selected day>}})`. Today only `?day=` is picked up.
4. `secretary/index.tsx` still declares the `access` state, now unused for `+`. Possible lint warning; clean it up.
5. Server typecheck and mobile `tsc --noEmit` have not been run. Expect small type errors, e.g.:
   - `Prisma.InputJsonObject` casts in `page-context.ts`.
   - `pageContext` JSON filter `{path:["state"], equals:"ASKED"}` in the page-context route.
   - `RoomDetail.pageContext` now required: check every place that builds a `RoomDetail` literal and fixtures.
   - `ReanimatedSwipeable` import path and types.
   - `c.lekaa`, `c.iconDim`, `c.placeholder`, `c.danger` usage.
   - The `RoomView` rows useMemo deps.
6. QC suites not run. These will need deliberate assertion updates (OWNER sees other users' rooms / scope=tenant / addMember succeeds are now intended failures):
   - qc-sec-s1.4 (OWNER visibility, scope tenant)
   - qc-sec-s1.6 (addMember/OWNER)
   - qc-sec-s3a.1
   - likely s1.11 (inbox now has `canOpenRoom`), s1.14 (routes), s1.7 (approvals by OWNER must still pass), s2.14 (scope UI), qc-sec-ui (U3 hex check only covers route files; the new colours are in the theme).
   - Run qc-ai-* and qc-cal-1.6/1.7 twice each, as the brief requires.
7. No new QC tests yet for: page-context resolve/markers/answer route, `hideRoom`, add-member blocked, approver reject via `canActOnApproval`.
8. Parity renders not done. Use `apps/mobile/qc/shoot-*.mjs` with `QC_NODE_MODULES=/root/qc-cal-nm/node_modules`; react-native-svg may need adding there; output to `/root/qc/b27-fab/`. The dashboard WebView cannot render on web, so show screen 1 on a native screen (e.g. the calendar).
9. `BusinessSwitcherSheet` still sends people to `/secretary` after switching business. Left as is (minimal-edit rule); decide whether it should go to "/".
10. AppShell `document.title` is sent after a 300 ms delay. Not yet checked in the real app.

## Known risks
- `service.ts` now sets an explicit UUID id on every ASSISTANT message, not only in secretary rooms. This is harmless for Prisma, but any test that asserts the cuid format will fail.
- `hideRoom` rejects the room's pending proposals and plans. Confirm this with the owner.
- The page-context route reuses the "send" rate-limit bucket (10/min).

## 17 Nov session (resume) — status
Commits: c1f0deb07 (Job A fixes) · 4fc4b138b (topbar2) · later commits listed in git log.
### Job A
- Item 1 done: `app/(app)/index.tsx` handles `{ev:"page-context"}` → `useLekaaPageContext` (cleaned, `/app` paths only) and passes `activePath` to SecTopBar.
- Item 2 done: `LekaaFabSlot` beside the composer in `secretary/new.tsx`, `customers/[id]/index.tsx`, `secretary/help/[caseId].tsx`.
- Item 3 done: calendar registers `CAL_DAY` of the selected day.
- Item 4 done: unused `access` state removed from `secretary/index.tsx`.
- Item 5: server `pnpm typecheck` EXIT 0; mobile `tsc --noEmit` EXIT 0 (both via iso.sh, 17 Nov). Fixes needed: raw U+2028/2029 inside a regex in page-context.ts; web `usePageEntity` cleanup returned boolean.
- Item 9 left as is (switch business still lands on /secretary).
### Job B (topbar2) — decisions
- Order store: **no migration** — reuses existing `User.prefs` (per user) with key `secSystemOrder[tenantId]` (per user per business). Written by one atomic jsonb UPDATE (`setSystemOrder` in src/lib/core/user-preferences.ts) so other prefs keys and other tenants are untouched. 20261228001200 was NOT used.
- `GET secretary/systems` → items sorted by the caller's order + `order` (full list incl. "home"). "home" is not in `items` so old app builds (which prepend Home themselves) do not show it twice.
- `PUT secretary/systems/order {keys}` (zod, max 200, gate null, 30/min) keeps only keys valid for the tenant now; missing ones appended in registry order.
- Mobile: `src/components/secretary/navSystems.ts` (store shared by strip + panel, live order while dragging), `openSystem.ts`, new SecTopBar strip, BusinessSwitcherSheet rewritten as the pull-down panel (gesture-handler + reanimated, no new native dep).
- Closing the panel while in reorder mode saves (same as "เสร็จ") — owner to confirm.
- Team badge colour: see final report.
