# T2.1 — App v2 shell + navigation (Opus · app lane · may start after T0.3, against the T0.2 spec with fixtures)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A7, R-C6, R-E C16/C17/C19 first. Contract: AI-TEAM-RUN §2 T2.1. Mockup: header of A1 (`airy-a.jpg` page 1 top: business name + ▾, avatar stack +N, no bottom bar).

## Verified facts (REVIEW §4)
- `app/_layout.tsx` (58 lines): fonts → `GestureHandlerRootView` → `AuthProvider` → `Gate` (no token → `/login`, no tenant → `/dna`, else `/(app)`) → `Stack` headerShown false. `app/(app)/_layout.tsx` (229): `Drawer` + `DrawerBody` (tenant switch, menu), `registerPush()`, push tap → `/chat/<id>` or `crmRouteFromLink`, `swipeEnabled:false` (`:171`). `app/(app)/index.tsx` (245) = **WebView** of `/app` (code from `POST webview-session`), postMessage handlers, `ORB_HIDDEN_FOR_NOW`.
- Native zones to keep untouched: `sessions.tsx`, `chat/[id].tsx`, `crm/**` (+ `CrmTabBar`), `member/**`.
- Auth state: `src/lib/auth-context.tsx` `AuthState { ready, token, user, tenants, activeTenantId, activeBranding, signIn, signOut, switchTenant, refreshMe }` — `refreshMe` loads `/api/mobile/me` (T1.10 adds `uiVersion`, `viewerRole`); until T1.10 is merged the fixture supplies them.
- API client `src/api/client.ts` (`api<T>(path, …)`, `ApiError`, `apiErrorText`, `sendChat` SSE). No i18n (T0.4 added `src/i18n/team.ts`). No react-query — add nothing heavy: a small `useTeamQuery(key, fn)` hook with cache + refetch is enough (notes).
- QC: `apps/mobile/qc/shoot-ai-team.mjs` (T0.3) mocks `shark.in.th`; fixtures keyed by route pattern.

## Deliverables
1. `app/(app)/index.tsx`: if `me.memberships[active].uiVersion === 2` → render `<TeamHome />` (placeholder: header + "ยังไม่ใช่จอตามแบบ · ทำที่ T2.2" body, Thai from i18n) else render the existing WebView component moved to `app/(app)/web.tsx` (exported component + route so the menu can open it with `?path=`). The WebView code moves verbatim (diff shows a move).
2. `src/components/team/TeamHeader.tsx`: business name + ▾ (opens the tenant sheet — T2.3; here a no-op with testID), `AvatarStack` of humans (initials) + AI (orbs) + `+N` from `summary` (fixture), right-side slot for screen-specific buttons; **no bottom tab bar** anywhere in the team tree.
3. `src/components/team/ProfileMenuButton.tsx` (avatar → opens the menu sheet — T2.11 placeholder).
4. `src/api/team.ts`: typed client for every route in the spec (`listEmployees`, `createEmployee`, …, `getInbox`, `decideInbox`, `sampleSpeech`, `getSummary`, `getQuota`, `getPacks`, `getNotifyPrefs`, `putNotifyPrefs`, `getPeople`, `saleNotify`, `getReport`, `getActions`, `undoAction`, `getPromotions`, `getKnowledge`, `rooms…`, `flows…`); request/response types mirrored from the spec (hand-written TS types; a comment per type cites the spec section).
5. `src/lib/team-query.ts`: `useTeamQuery(key, fn, { refetchOnFocus })` + `invalidate(keyPrefix)`; `LoadingState`/`EmptyState`/`ErrorState` usage conventions.
6. Deep links: `shark://team`, `shark://team/employee/<id>`, `shark://team/task/<id>`, `shark://team/inbox`, `shark://team/plan` → routes; push `data.link` handling added next to the existing `conversationIdFromNotification` logic in `(app)/_layout.tsx` (small hunk).
7. `scripts/ai-team-ui-inventory.json` initial rows (header buttons); F16.4/F16.5 in `scripts/fitness-ai-team.mts` scanning `apps/mobile/app/(app)/{team,tasks,inbox,hire,profile,settings,plan,rooms}/**` + `apps/mobile/src/components/team/**` for `testID=` vs inventory.
8. Fixtures `apps/mobile/qc/fixtures/ai-team/t2.1.json` (`me` with uiVersion 1 and 2 variants, `summary`).

## Files you own
`app/(app)/index.tsx`, `app/(app)/web.tsx`, hunk in `app/(app)/_layout.tsx` (deep link only), `src/components/team/{TeamHeader,ProfileMenuButton}.tsx`, `src/api/team.ts`, `src/lib/team-query.ts`, `src/i18n/team.ts` additions, `scripts/ai-team-ui-inventory.json`, F16.4/F16.5 block, fixtures. Do not touch `sessions.tsx`, `chat/**`, `crm/**`, `member/**`, `app.json`.

## Acceptance (oracle `qc-ai-t2.1`)
S1 [static] index branches on uiVersion; WebView lives in `web.tsx` · S2 shots: uiVersion 1 index pixel-equal to baseline shot (taken in the red run); uiVersion 2 header matches the mockup crop (controller eye) · S3 [static] no tab bar in team tree · S4 [static] client covers every spec route · S5 loading/empty/error renders · S6 F16.4/F16.5 · S7 deep link map unit test (pure function) · S8 mobile typecheck · S9 before/after shots of sessions/chat/crm/member unchanged.

## Controller rulings
- v2 tree lives under `(app)` so the Drawer stays mounted for 1.0 users; in v2 the drawer is never opened (swipe already disabled).
- The team header is a component used by every team screen (no per-screen header code).
