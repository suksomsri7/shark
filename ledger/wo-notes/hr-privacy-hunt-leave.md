# HR privacy hunt (lane 2): leave list visibility. 22 Oct 2026
Hunter: PRIVACY HUNTER (Opus) · tree `/root/projects/shark-hr` · branch `hunt/hr-privacy-leave` = origin/session/hr @17635949 · prisma generate ok · QC4 via `iso.sh → qc4.sh → with-gate-lock.sh`
Trigger: the H0.7 oracle writer saw a STAFF user holding only `hr.leave.request` get every leave row from `leaveItemsForViewer`.
Probe: `/tmp/hr-hunt-privleave/probe1.mts` (log `probe1.log`, exit 0). Tenants `qc-hunt-hrpriv-{a,b}-<ts>`. Tenant A has two HR systems (A, B) and tenant B has one. There are 12 viewers, all built like `qc-hf-hr-privacy.mts`.

## Short answer
The observation is **real and works as built**. It is **not a regression** and **not a breach of the letter of the contract**. HF-HR-0 D9 deliberately fixed only `reason`. HF-HR-0 "Found but left" records "HrLeaveSection history / pending names+types+dates still visible to any member … hiding lists changes the page for staff who file leave". `fitness-hr` `PAGE_GUARD_BASELINE` carries `/hr/leave/page.tsx` as debt that "closes in H2.7".

It **is a policy defect** for these reasons:
- The same tuple (employee name + leave type incl. **SICK** + dates + status) is gated by `hr.leave.read` in 3 other places, and the code there gives a PDPA reason.
- The permission catalogue defines `hr.leave.read` as "ดูข้อมูลการลาของทั้งร้าน" (see the whole shop's leave). That is exactly what `/hr/leave` hands to every member.
- H0.7 R3 removes the reason HF-HR-0 gave for leaving it: after R3, STAFF can file only for themselves, so they no longer need other people's rows.

## Findings

### F1 · MEDIUM · `/hr/leave` + `leaveItemsForViewer` show the whole HR system's leave to every tenant member
- Where:
  - `src/lib/modules/hr/privacy.ts:125-141`: no row filter. Only `reason` is conditional.
  - `src/lib/modules/hr/service.ts:673-688`: `listLeaves`/`pendingLeaves` take no viewer.
  - `src/app/app/sys/[id]/hr/leave/page.tsx:10-23`: the only gates are `requireTenant` and the system being type HR.
- Who sees what they should not: every member of the tenant, with or without HR keys, including the linked employee. They get every colleague's leave row: name, type (SICK/PERSONAL/VACATION/OTHER), from/to dates and status. Pending rows go to the `"use client"` `BulkLeaveApprovals` as props; history is rendered as server HTML.
- Contradictions in the same codebase:
  - `calendar/service.ts:127-131`: "🔒 PDPA: วันลา (โดยเฉพาะลาป่วย = ข้อมูลสุขภาพ) … พนักงานทั่วไปที่เปิดปฏิทินจะไม่เห็นวันลาของเพื่อนร่วมงาน" (regular staff opening the calendar do not see colleagues' leave days).
  - `ai/tools.ts:2066-2069` (`upcoming_schedule`).
  - `kanban/link-resolvers.ts:301-305` (HR_LEAVE link).
  - `core/permissions.ts:503`, the key's label.
- Evidence (M1): 9 of the 10 viewers without `hr.leave.read` in tenant A got pending=2 / history=3. That includes the colleague's SICK row with name and dates, and the self rows. Those viewers were: payroll viewer, STAFF+`hr.leave.decide`, STAFF+`hr.leave.request` only, STAFF+`hr.employee.create`, STAFF+`hr.attendance.clock`, plain member, linked self, linked self+request. The calendar loader gave the same viewers **0** HR_LEAVE events (M3). Sample DTO for request-only: `{"id":…,"employeeName":"HUNT-COLLEAGUE-…","type":"SICK","fromDate":"2026-10-24…","toDate":"2026-10-25…","status":"PENDING"}`.
- Smallest fix:
  - In `leaveItemsForViewer`, compute `wide = hrAccessOf(v).readLeave || evaluate(v, {module:"hr", action:"hr.leave.decide"})`.
  - If not `wide`, pass a query filter `employee: { linkedUserId: v.userId }` to both readers. An empty `userId` means no rows.
  - Add an optional `where` param to `listLeaves`/`pendingLeaves`. Filter in the query, not in memory, because of `take=100`.
  - Optional: hide `BulkLeaveApprovals` checkboxes when the viewer is not `wide`.
  - Oracle impact checked:
    - `qc-hf-hr-privacy` L-1/L-3 use `hr.leave.read` viewers, and L-2 needs only a non-null object without reason. All three stay green.
    - H0.7 oracle X8.3 needs `rowsA.length > 0` for staff A, who files their own leave in S1. It stays green.
    - `visual-hr` `leave` (users: all) still renders (smaller list).
- Owner: **H0.7**, as a small additive ruling attached to R3 ("STAFF files only for themself" ⇒ "STAFF sees only their own leave rows"). This needs a controller ruling because R9 says "DTOs unchanged". The keys stay unchanged; only the row set shrinks. If the controller keeps H0.7 frozen, move it to H2.7, which already owns the page baseline.

### F2 · MEDIUM · AI `pending_leaves` is OPEN (same tuple, tenant-wide)
- Where:
  - `ai/tool-access.ts:81` `pending_leaves: OPEN // hr/leave`. The header comment at `:6` lists "ลา" among web gates with no read key.
  - `ai/tools.ts:222-245`. The comment at `:241` ("ToolCtx ไม่รู้ว่าใครถาม", ToolCtx doesn't know who is asking) has been **stale since CRM C5.5-G1**. `ctx.actor` is now mandatory, and `upcoming_schedule` at `:2068-2069` already gates leaves via `aiActorMembership` + `hr.leave.read`.
- Who: every AI-chat user (`ai.chat.send`) and every general API key (scope empty) gets name + type (SICK) + dates + leave id of all pending leaves in the first HR system.
- Evidence (M2):
  - All 11 tenant-A member actors got `colleague=true SICK=true reason=false`.
  - The general API key got `colleague=true`.
  - `upcoming_schedule` refused the same non-calendar viewers. Among those with calendar access, only owner/MANAGER saw leaves.
- Smallest fix: same rule as F1 inside the tool. Use `aiActorMembership(ctx.actor)`: wide ⇒ all rows; otherwise only rows whose employee is linked to `actor.userId`. Make an explicit choice for API keys (e.g. general key = wide, consistent with `upcoming_schedule`). Update the `:6`/`:81` comments. Shared hot file ⇒ one marked hunk.
- Owner: same WO as F1. The web gate and the AI gate must move together (tool-access rule "same key as the web gate").

### F3 · LOW · `hr.leave.decide` without `hr.leave.read` = deciding blind; key model inconsistent
- STAFF+`hr.leave.decide` can approve/reject (`actions.ts:289/310`) but sees no reason (M1 reason keys 0) and no calendar leave (M3 0). A payroll viewer opens national ID/bank (M4 open+sensitive) but not leave reasons.
- Not a leak, so no fix is needed for privacy. It is a product decision about key bundles. Owner: H2.7 / H2.11 (request inbox).

### F4 · LOW · Kanban "หาคนแทน" (find a replacement) card title carries name + leave type, outside the `hr.leave.read` gate
- Where: `platform/kanban-bridges.ts:404-424`, title `หาคนแทน: <name> ลา<ลาป่วย…> <dates>`. Anyone who can read the target board sees it, while the HR_LEAVE link resolver on the same card requires `hr.leave.read`. The integration is opt-in (`cardOnLeave.enabled`). This is static evidence; there is no runtime probe.
- Fix: a neutral title without the type (`หาคนแทน: <name> ไม่อยู่ <dates>`, "find a replacement: <name> away <dates>"), or show the type only via the gated link. Owner: H2.7.

### F5 · INFO · Raw HR loaders load whole `HrEmployee` rows server-side
- `listLeaves`/`pendingLeaves`/`listAttendance` use `include: { employee: true }`, and `listEmployees` returns full rows (M5: `nationalId`, `bankAccountNo` present, plus `pinHash`). Today they are only DTO-mapped (`leaveItemsForViewer`) or rendered as server HTML (`a.employee.name`). Nothing crosses to a client component, so there is no leak.
- It is the opposite of COMMON §C.1 defence-in-depth: one careless client prop would leak. Suggest `select: { name: true, … }` when H2.5/H2.7 rewrite these readers.

### F6 · LOW (known, HF-HR-0 S5/S6) · `/hr/attendance` and `/hr/employees` gated by `requireTenant` only
- Every member sees names, positions, phones, late/absent counts and **leave-day counts** per employee. The baseline is already recorded ("closes in H2.5" / "H1.1/H4.4"). No change proposed here.

## Viewer matrix (probe M1–M4, tenant A · ctx = HR system A)
| viewer | `hr.leave.read` | `leaveItemsForViewer` rows (colleague / self / sysB / other tenant) | reason | AI `pending_leaves` | AI `upcoming_schedule` leaves | calendar HR_LEAVE | colleague profile (D4) | own profile |
|---|---|---|---|---|---|---|---|---|
| OWNER | ✔ | 2/2 · 1 · 0 · 0 | ✔ text | name+SICK+dates, no reason | ✔ | 4 | open+sensitive | open |
| payroll viewer (STAFF `hr.payroll.read`) | ✘ | **2/2 · 1** · 0 · 0 | ✘ | **name+SICK+dates** | refused (no calendar key) | 0 | open+sensitive | open |
| MANAGER role | ✔ | 2/2 · 1 · 0 · 0 | ✔ | name+SICK+dates | ✔ | 4 | open (general) | open |
| STAFF `hr.leave.decide` | ✘ | **2/2 · 1** · 0 · 0 | ✘ | **yes** | refused | 0 | null | null |
| STAFF `hr.leave.read` | ✔ | 2/2 · 1 · 0 · 0 | ✔ | yes | refused (no calendar key) | 4 | open (general) | open |
| **STAFF `hr.leave.request` only** | ✘ | **2/2 · 1** · 0 · 0 | ✘ | **yes** | refused | 0 | null | null |
| STAFF `hr.employee.create` (HR key, no leave key) | ✘ | **2/2 · 1** · 0 · 0 | ✘ | **yes** | refused | 0 | open (general) | open |
| STAFF `hr.attendance.clock` | ✘ | **2/2 · 1** · 0 · 0 | ✘ | **yes** | refused | 0 | n/p | n/p |
| plain member (STAFF, no keys) | ✘ | **2/2 · 1** · 0 · 0 | ✘ | **yes** | refused | 0 | null | null |
| linked employee (self, no keys) | ✘ | **2/2 (others' rows)** · 1 · 0 · 0 | ✘ | **yes** | refused | 0 | null | null (Pr-6 intended) |
| linked self + `hr.leave.request` | ✘ | **2/2** · 1 · 0 · 0 | ✘ | **yes** | refused | 0 | n/p | n/p |
| other-tenant OWNER (holding A's systemId) | n/a | 0 · 0 · 0 · 0 | ✘ | own tenant only | n/a | n/a | null | n/a |
| general API key (scope empty) | n/a | n/a | n/a | **yes** (no reason) | n/a | n/a | n/a | n/a |

Bold = sees rows the permission label (`hr.leave.read` = whole-shop leave) says they should not. n/p = not probed.
DTO keys for every viewer: `id, employeeName, type, fromDate, toDate, status`, plus `reason` only with `hr.leave.read`. No filer, linkedUserId, nationalId or bank fields.

## What held
- **D9 reason:** only for `hr.leave.read` holders (OWNER, MANAGER role, STAFF+read). Absent for the other 9 viewers. AI `pending_leaves` never returns a reason, for any actor or API key.
- **Tenant isolation:**
  - The other tenant's OWNER with A's systemId got 0 leave rows and a null profile.
  - `listLeaves(tenant2 + A systemId)` = 0.
  - The tenant-2 AI tool sees only its own rows.
- **System isolation:**
  - ctx=A never includes system B's row (0 for all viewers), and ctx=B returns only B's row. `tenantDb` injects systemId (`scope.ts:123` HrLeave sys()).
  - Note: HR permissions are tenant-wide by design (no per-system keys), so an HR key covers every HR system of the tenant. AI `pending_leaves` reads only the first HR system (a functional gap, not privacy).
- Calendar loader + AI `upcoming_schedule` + kanban HR_LEAVE/HR_EMPLOYEE resolvers gate on `hr.leave.read` correctly.
- **D3/D4:**
  - The profile matrix matches the HF-HR-0 rulings: `hr.employee.create`/`hr.leave.read`/payroll viewer/MANAGER can open, others get null, and only payroll viewers get sensitive fields.
  - Payslip: no change on this base; `qc-hf-hr-privacy` covers it.
- **Payroll / pay adjustments / OT notes:** `PayrollSection` returns early unless `canViewPayroll` (`payroll-ui.tsx:75`). Adjustments and notes are not rendered for anyone else. No HR REST or mobile routes exist (`src/app/api/**` has no HR reader; `api/mobile/*` has none).
- **Approval core:** the `/app/approvals` pending and "my requests" lists show only `entityLabel(entityType)` (+ amount), never leave fields. "My requests" filters `requestedById = userId`, so other people's leave cannot appear there. Pre-H0.7 leave requests carry an employee id, so they never list at all; H0.7 R2 fixes that, and the rendering stays label-only.
- **Q5 web gate vs DTO:** consistent with each other. The `/hr/leave` page has no key gate and the loader has no row gate, so there is no case of a "page gated on read but loader callable with request". The inconsistency is with the calendar, AI-schedule and kanban gates and with the key's own definition (F1/F2).

## Residue / runtime
- `[residue] tenants qc-hunt-hrpriv-*=0 · HUNT employees=0 · HUNT leaves=0` (checked in `finally`).
- No unit of mine is running. I ran one `iso-*` unit, which finished (exit 0). I did not stop or touch any other unit, `/tmp/shark-gate-pos.lock`, `shark-hr-b` or `shark-hr-c`.
- No product code or oracle was modified. This note is untracked and not committed. Scratch: `/tmp/hr-hunt-privleave/` (probe + log).

## Verdict
**FIX IN H0.7** (with a controller ruling), **no hotfix needed**.
- No hotfix because nothing sensitive under §C.1 leaks: no reason, ID, bank or PIN data, and tenant and system isolation hold.
- The fix is F1 + F2 together: STAFF without `hr.leave.read`/`hr.leave.decide` get only their own leave rows on `/hr/leave` and in AI `pending_leaves`. It fits H0.7 R3's self-only posture and keeps `qc-hf-hr-privacy` 194/194 and H0.7 X8.3 green.
- If H0.7 must stay frozen, defer F1/F2 to H2.7 (page baseline owner), together with F3/F4/F5.
