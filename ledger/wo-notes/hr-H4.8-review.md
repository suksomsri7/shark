# H4.8 review — REST `/api/v1/hr` + skill `shark-hr-api` (reviewer, read-only)

Object reviewed: `128043298` vs oracle base `52a3bd5d0` (39 files, +3155/−5). Read by object only; working tree untouched; nothing run.
Inputs: brief H4.8 (+ CONTROLLER RULINGS 14 Nov), oracle notes (rulings 1–5), builder notes §F/§4, COMMON §C/D/F, POS `pos/api/**` pattern.

**Verdict: MERGE WITH NOTES** — no BLOCKER/MAJOR found. Authn/authz and the serializers hold; findings are 4 MINOR + notes, two of which (M1, M2) want a controller/owner word.

## 1. AuthN/AuthZ (checked, OK)
- Key resolution: core `requireApi` (`src/lib/api/require.ts:120-218`) verifies (revoked ⇒ 401 `unauthorized`, expired ⇒ 401 `key_expired`), tenant = `key.tenantId` (never URL/header), system = key's bound system (header ≠ bound ⇒ 403 `system_mismatch`), `appSystem` lookup `type:"HR"` under `tenantDb(key.tenantId)` (cross-tenant/other-type ⇒ `system_mismatch`).
- Ruling 4: `hr/api/dispatch.ts:17-28` reads the bearer's bound system (read-only `verifyApiKeyDetailed`) and builds the actor with `bound = boundSys === resolved systemId`; `hr/api/actor.ts:33,45` ⇒ unbound/other-system key gets `can()` = false and an empty synthetic permission set (`actor.ts:57-59`). Unbound key + header ⇒ core 403 `scope_missing` (same bytes as a bound key without hr scopes). Key bound to HR system B + header A ⇒ `system_mismatch`; key bound to B without header works on B only. Static `HR_API_CONFIG.makeActor` is fail-closed (`config.ts:16`).
- IDOR across HR systems of one tenant: readers use `tenantDb({tenantId, systemId})`, which injects `systemId` for system-scoped models (`core/db.ts:72-75`) ⇒ foreign ids 404 (`hrNotFound`, one constructor, same bytes).
- Issuer rule (Q2): `defineHrOp` wraps every handler with `assertHrIssuer` (`op.ts:22-24`, `actor.ts:77-80`): live accepted Membership of `createdById` in `actor.tenantId` with role OWNER, else 403 `forbidden` fixed text, `nothingWritten`. Cached per request (WeakMap).
- Issuer-as-viewer ops (`ops/reports.ts`, `ops/payslips.ts`): output always through allow-list serializers; reports drop class `I` always and `$` unless the key holds `hr.payroll.read` (`serialize.ts:259-292`: columns/values/totals/warnings all filtered by `kept`; `notes` are fixed catalogue texts — `reports.ts:625-637`). Payslip = fixed keys, no `bankMasked`/`href`. Errors carry fixed Thai texts only (`payslip.ts:74` maps codes to `SLIP_TEXT`). No pagination metadata on these ops.
- Other issuing paths (builder §4 claim) — **verified true**: account `connections-actions.ts:96-150` (ACCOUNT_SCOPE_KEYS only, ACCOUNT system), rotate `:172-192` + `connections.ts:487-515` (only ACCOUNT-bound keys whose scopes ⊆ ACCOUNT_SCOPE_KEYS ⇒ an HR key cannot be rotated there; `rotateApiKey` has no other caller), CRM `crm/settings/api/actions.ts:78-92` (CRM bundle ids, CRM system), kanban `settings-actions.ts` (KANBAN_SCOPE_KEYS, KANBAN system), member action + REST `apikeys.create` (`member/api/ops/settings.ts:169-197`, member bundles enum, `actor.systemId` = member system), POS `pos/api-key-actions.ts` (POS_SCOPE_KEYS, POS system), platform `/app/settings/api/actions.ts:40` (`createApiKey(ctx,name)` ⇒ unbound `[]`). No scope-edit / re-bind function exists in `api-keys/service.ts` (only create/rotate/revoke). A non-HR-bound key carrying hr.* would be dead under ruling 4 anyway. Legacy `/api/v1/*` and AI tools stay general-key only (`route-auth.ts isGeneralApiKey`): HR keys are bound + scoped ⇒ refused there.

## 2. `privacy.ts` + the two roster gates (ruling Q1)
- `privacy.ts:41` adds exactly `|| can("hr.employee.read")` (evaluate-based). OWNER/MANAGER already true; STAFF with `hr.*` already true via `hr.employee.create`; plain STAFF/employee unchanged ⇒ **no existing human role gains** (Q1 holds). `seeSensitive` untouched (`canViewPayroll` = OWNER or `hr.payroll.read`); the synthetic viewer strips `hr.payroll.read` (`actor.ts:22,59`) ⇒ docs/national id/bank never load for keys. API output = `serializeEmployee` (15 R4 fields).
- `roster.ts:124`, `roster-board.ts:60`: one OR-term each on `permissions["hr.roster.read"] === true`; write gates untouched.
- Sha re-take (item 9): `git show 128043298:src/lib/modules/hr/privacy.ts | sha256sum` = `ba518b3d…afed010` = new pin; base file = old pin `9b95844d…`; the privacy.ts diff is that one line only; the qc-hr-h3.8 diff is the pin line only. **OK.**

**M1 (MINOR — owner/controller wording) — the new keys are grantable to humans and open more in the app than their labels say.** `permissions.ts:600-602` puts `hr.employee.read` ("ดูรายชื่อพนักงาน (ไม่รวมข้อมูลอ่อนไหว)") and `hr.roster.read` into the normal staff permission editor (comment: "ให้คนได้ทีละคีย์"). Scenario: OWNER ticks `hr.employee.read` for a STAFF ⇒ `/hr/employees/<id>` now opens the in-app profile DTO (`privacy.ts:59-91`): phone, e-mail, birthDate, gender, marital status, full address, emergency contact, `note`, `hasPin` — the very fields the API docs call "sensitive" (`ops/employees.ts:59`). `hr.roster.read` for a STAFF ⇒ draft roster + warnings, the attendance board and time/OT reports incl. in-app CSV/XLSX exports (`reports.ts:96`). Not a regression (same as `hr.leave.read` today) and brief R1 asked for these hunks, but the label invites a wider grant than intended. Ask: relabel (e.g. "…ข้อมูลติดต่อ/ที่อยู่ไม่ปิด") or keep these two keys API-only (hidden in the staff editor) — controller's call.

## 3. Data exposure per op (checked, OK)
employee/unit/shift/policy/roster/attendance/leave/balances/slip/history/report serializers build every key from fixed lists (`serialize.ts`), no spread. Roster = `published === true` only (`ops/roster.ts:55`); slot drops GPS/photo/device/note/slotKey; `leave.label` = policy/category name (`judge.ts:388`), not the reason; leaves drop `reason`/`filedBy`/attachments; non-ISSUED slip ⇒ 409 before audit/data. OWNER-linked rows appear in lists/pay reads (owner consented to the pay bundle) — NOTE only.

**M2 (MINOR) — money read through `ot` (and any `$` column on time/ot/leave) by a pay key is not audited.** `ops/reports.ts:49` audits only when `need === "hr.payroll.read"`, but `serializeReport(..., {pay:true})` returns OT amounts (`reports-rules.ts` ot `$` columns `otWorkdayAmt…amount`) for `hr-payroll-read` keys on `GET /reports/ot`. R8 intent "pay reads audited" is partly missed (oracle only asserts pay reports). Fix: audit when `pay && kept has a $ column`, or `pay` ⇒ audit every report.

## 4. `POST /leaves` (checked, OK)
`.strict()` zod, no `reason` (`ops/leave.ts:93-103`); re-check `hr.leave.decide` ⇒ 403 `scope_missing`; employee via `getEmployee` (system-scoped) ⇒ 404; issuer-linked/OWNER-linked ⇒ 403 `forbidden` before any write; branch check at fromDate; policy must be active in scope; then `requestLeave(reason:null, actorUserId: issuer)` = UI validation/lock/chain/balance/overlap. Idempotency = core (`(keyId, idemKey)` unique, request hash, replay/conflict/in-progress). Audit = core `hr.api.leaves.create` (API_KEY, keyName). Any non-owner employee of the system can be filed for — matches brief §4 #11 (on-behalf rule, key = all branches).
- N1 (NOTE): status is hard-coded `"PENDING"` (`:156`); `requestLeave` recomputes `ownerAuto` itself (`service.ts:483`) — if the linked user is promoted to OWNER between the handler check (`:132`) and the call, the row is APPROVED while the API says PENDING. Narrow race; read the status back or accept.
- N2 (NOTE): an ended employee answers 422 `LEAVE_EMPLOYEE_ENDED` instead of 404 (existence visible) — same key can list employees anyway.

## 5. Key issuance (checked, OK)
`api-key-actions.ts:28-36` `assertCan(api.key.create|revoke)` + `api/keys.ts:35-46` OWNER in session AND accepted OWNER row in DB + platform action + system `type:"HR"` of tenant; bundle ∈ hr-* or scopes ⊆ ∪hr-*; pay ⇒ `payConsent === true` and TTL ≠ 0 — all server-side; revoke limited to keys bound to this HR system; secret returned once, stored as sha256 (core); errors logged as `e.name` only. Name: trim + ≤60, no control-char filter (rendered escaped) — NOTE.

## 6. Abuse/ops (checked, OK)
Report bucket for reports + payslips (`rate:"report"`); employees cap 500 + `truncated`, leaves cap 100 + `truncated`, balances cap; pageSize ∈ {10,20,50}, page ≤ 100000; order (name,id) / (fromDate desc,id). Ids only in paths; refusals fixed text.
- N3 (NOTE): every HR request verifies the key twice (`dispatch.ts:21` + core) — one extra indexed read per call; acceptable given the frozen core.
- N4 (NOTE, core/frozen): zod enum messages echo the received value in `details` (same in POS).

## 7. Docs/skill
OpenAPI/HR-API.md/endpoints.md built from `HR_OPS` (`api/openapi.ts`, `gen-hr-api-docs.mts --check`); recipes use only ids/dates in URLs; SKILL.md privacy section is adequate (no PII in URLs, never ask for ID/bank, a filed leave is not an approval, stop on `forbidden`).
- **M3 (MINOR)** SKILL.md Setup / developers page: "a shop-wide key … gets 403 `scope_missing` on every call" — true only with `X-Shark-System`; without it core answers 400 `system_required` (`require.ts:166-177`). One-line fix.
- N5: `/developers/account` lists all `API_SCOPE_BUNDLES` unfiltered, so the 3 hr-* bundles now show on the accounting developer page (cosmetic; pos-* already did).

## 8. Out-of-list hunk — `ConnectionsPanel.tsx:409-412`
Three Thai help strings in `BUNDLE_HELP_TH: Record<ApiScopeBundleId,…>` (typecheck-forced). The panel only offers `ACCOUNT_BUNDLES` (`:420`, filter `account.`) ⇒ never rendered, nothing selectable. Harmless.

## 9. COMMON §F vs diff
- **M4 (MINOR)** §F.10 ticked "[x] Files ⊆ brief §5 list" but `src/components/account-v2/ConnectionsPanel.tsx` is outside the list (disclosed in notes §1 table, harmless — tick should read "+1 forced hunk, disclosed").
- §F.2/5/6/7/9: no tx/migration/outbox/lock in the diff — consistent. §F.4: refusals Thai, identical 404 bytes — consistent. §F.8: core DB buckets — consistent. §F.1: no new page — consistent.

## Summary for the controller
No BLOCKER/MAJOR. Before or after merge: M2 (audit `$` columns on time/ot reports for pay keys) and M3 (doc line) are small fixes; M1 is a wording/visibility decision for the two new RBAC keys in the staff editor; M4 is a notes correction.
