# HUNT H2.4 — Clock v2 · adversarial probes (11 Nov 2026 · head 8dc452a13 · lane DB ep-orange-dust via qc-hr.sh)

Verdict: **FIX FIRST** — 1 MAJOR (session follows a moved roster entry), 2 MEDIUM, 1 MINOR. Races, PIN budget, and GPS parsing HELD.
Each probe used its own tenant (`qc-hr-h24hunt-p<n>-…`) and cleaned up in `finally`. All 6 printed `RESIDUE clean`. Probe files were deleted afterwards.

## P1 — kiosk PIN guessing + kiosk branch scope
Tried: (a) PIN of a u3 employee at a kiosk account with unitAccess [u1] and at one with [u1,u2]. unitId was derived exactly as `kioskClockAction` does (`actions.ts:335-336`). (b) 12 wrong PINs in 2 bursts of 6 parallel guesses from one kiosk callerKey, then the right PIN. (c) the same 12 guesses from a second kiosk account.
Observed:
`1a u3 PIN @kiosk[u1]=PIN ไม่ถูกต้อง · @kiosk[u1,u2] (unitId=null)=CLOCKED kind=IN`
`1b 12 wrong → {"PIN ไม่ถูกต้อง":9,"ลองใหม่ในอีก 600 วินาท":3} · right PIN after = ลองใหม่ในอีก 600 วินาที · hr.pin.locked rows=1 · caller bucket=10` (1a's wrong guess took the 10th slot)
`1c second kiosk account: compared=10 of 12 · total compared this shop=19`
- (b)/(c) **HELD**. The budget is exactly H0.5's: 10 per caller, the lock is audited once, and the right PIN is refused while locked. callerKey is set on the server (`kiosk:<userId>`), and nothing in the form or input can change it.
- (a) **FINDING MEDIUM — branch-scope bypass on multi-branch kiosk accounts.** A kiosk account limited to [u1,u2] gets `unitId=null`, which means the whole shop, so it clocks staff of u3, a branch it has no access to. Before H2.4 the per-employee `hrTarget` check refused this. Builder notes §4 list it as a "loss". It still breaks COMMON §F.3: an explicit unit list is a limit, not "all".
  Smallest fix: in `kioskClockAction`, when `ua` is an explicit list of 2 or more units, check after `verifyPin` (before `clock`) that the employee's unit of the day (`unitOfDay`, or no unit) is in `ua`. Otherwise answer `PIN_TEXT.wrong`; the slot is already counted. Alternatively give `verifyPin` a `unitIds[]` filter.
```ts
const unitOf = (ua: string[]) => (ua.length === 1 && ua[0] !== "*" ? ua[0]! : null); // = actions.ts:336
const kMulti = await mkUser(T, "kmulti", "STAFF", [u1, u2], { "hr.attendance.clock": true });
const eZ = await mkEmp(T, s.id, "Z", { unitId: u3 }); await hr.setPin(ctx, eZ, "905173");
const r = await cl.kioskClock(ctx, { pin: "905173", callerKey: `kiosk:${kMulti.id}`, unitId: unitOf(kMulti.unitAccess) });
ck("HUNT-1a", !r.ok && r.reason === PIN_TEXT.wrong && (await P.hrAttendance.count({ where: { tenantId: T } })) === 0);
```

## P2 — roster entry moved after a linked IN
Tried: A clocks IN, linked to entry E (09–17). The owner then `moveEntry`s E (a) to employee B on the same day, or (b) to A on D+2 while A's session is still open (A forgot to clock OUT). Then A and B tap NEXT.
Observed:
`2a A.IN link=true move=true A.next@17:05=OUT A.OUT.link=E1(now B's) B.IN link=true rowsOnE1=A:IN,A:OUT,B:IN employeesOnE1=2`
`2b A.IN link=true move=true A.tap 05-13 09:00 kind=OUT link=E2 (expected IN — legacy/unlinked day) · next after=IN`
**FINDING MAJOR.**
- `sessionOf` (`clock.ts:113`) reads the linked entry without checking whose it is or where it now sits. The session window follows the entry's new date or employee.
- (b) A's arrival the next day is stored as **OUT**, with lateness lost. This is D13b in a new form.
- (a) One entry carries IN/OUT rows of two employees. H2.5 late/absent per entry will misjudge both.
Smallest fix, either:
- In `sessionOf`, use the entry only if `entry.employeeId === employeeId` and the session's IN `at` lies in `[start − earlyInMin, end)`. Otherwise treat the session as unlinked (legacy rule).
- Or in `moveEntry`/`removeEntry` (same tx), set `rosterEntryId = null` on attendance rows of the old owner/date.
```ts
const E2 = await entry(eA, "2031-05-12");                                   // 09–17 published
await cl.clock(ctx, { employeeId: eA, kind: "NEXT", requireActive: true }, { now: at("2031-05-12", "09:00") });
await ro.moveEntry(ctx, OWNER_V, E2, { date: "2031-05-14" });
const r = await cl.clock(ctx, { employeeId: eA, kind: "NEXT", requireActive: true }, { now: at("2031-05-13", "09:00") });
ck("HUNT-2b", r.kind === "IN");
const E1 = await entry(eA, "2031-05-05");
await cl.clock(ctx, { employeeId: eA, kind: "NEXT" }, { now: at("2031-05-05", "09:00") });
await ro.moveEntry(ctx, OWNER_V, E1, { employeeId: eB });
await cl.clock(ctx, { employeeId: eA, kind: "NEXT" }, { now: at("2031-05-05", "17:05") });
await cl.clock(ctx, { employeeId: eB, kind: "NEXT" }, { now: at("2031-05-05", "09:30") });
const owners = new Set((await P.hrAttendance.findMany({ where: { rosterEntryId: E1 }, select: { employeeId: true } })).map((r) => r.employeeId));
ck("HUNT-2a", owners.size === 1);
```

## P3 — retention (cron all-tenant mode · deviceId · run twice)
Tried: (a) a mobile clock at a `gpsRequired=false` site that sends coordinates and a deviceId. (b) A raw MOBILE row with lat/lng/accuracy/deviceId/photoKey, then `purgeClockPrivacy({now})` **without tenantId** (the cron path, not run by S8.2), twice. `now` was 2000-01-15, so no other tenant's rows qualified.
Observed:
`3a gpsRequired=false mobile ok=true stored lat=null deviceId=iPhone-of-A-serial-XYZ source=MOBILE`
`3b cron-mode p1={"ok":true,"geo":1,"photo":1} p2={"ok":true,"geo":0,"photo":0}`
`3b row 1999-10-02 lat=null acc=null deviceId=iPhone-of-A-serial-XYZ photo=null distanceM=3`
- Cron mode, the second run returning 0, and keeping `distanceM`: **HELD**.
- **FINDING MINOR:**
  - `deviceId` is never purged. R12 classes it as sensitive, and builder notes §4 claim it is "purged after 30 d", but R11/`purgeClockPrivacy` does not touch it.
  - `deviceId` is also stored at `gpsRequired=false` sites, where R8 says the device's location data is not kept.
  - Fix: add `"deviceId" = NULL` to the geo UPDATE (and to its WHERE), and/or drop `deviceId` when `!site.gpsRequired`. Either fix the notes, or ask the controller to extend R11.
```ts
await P.hrAttendance.create({ data: { tenantId: T, systemId: s.id, employeeId: eA, kind: "OUT", at: new Date("1999-10-02T10:00:00Z"), source: "MOBILE", lat: 13.7563, lng: 100.5018, accuracyM: 8, distanceM: 3, inRadius: true, deviceId: "dev-1" } });
await cl.purgeClockPrivacy({ now: new Date("2000-01-15T00:00:00Z") });   // cron mode (no tenantId)
const r = await P.hrAttendance.findFirst({ where: { tenantId: T }, select: { lat: true, deviceId: true, distanceM: true } });
ck("HUNT-3", r.lat === null && r.deviceId === null && r.distanceM === 3);
```

## P4 — GPS shapes / boundary / borrowed branch / cross-tenant actor
Tried 15 payloads beyond S5.4, D (a u2 employee) sending u1 coordinates, D loaned to u1 today, and the actor `{tenantId: other tenant, userId: A}`.
Observed:
- `acc=0 → OK` · `acc=-0 → OK` · `acc missing → mWeak` · `acc='5' / Number obj / swapped / bigint / array / {valueOf} → mBadGps` · `150.4m → OK(d=150)` · `150.6m → mOutside` · `1e-320,0 → mOutside`
- `kind=IN → OK(IN)` · `kind=OUT+employeeId(D)+unitId(u2) → OK(IN)`: employeeId/unitId ignored, kind coerced to NEXT
- `deviceId 5KB → OK` (stored truncated to 100)
- `D@u2 with u1 coords → mOutside` · `D borrowed→u1 → OK`
- `actor{T2,userA} → mNoEmp · audit rows written into T2=1`

**HELD.** `accuracyM 0` is accepted; that falls under Q7 (forged values accepted). 4c can only be reached at lib level: `mobileClockAction` takes the tenant from `requireMembership`.

## P5 — races (6 lanes, same instant, 10 rounds across a 22–06 shift; plus a real-time burst with POS `clockSelf`)
Tried: kiosk NEXT, kiosk BREAK_START, mobile NEXT/BREAK_START/BREAK_END, and service NEXT, fired at the same injected `now` in shuffled order. Then a real-time burst on a fresh employee: 2×`clockSelf IN` ∥ 2×kiosk ∥ 2×mobile.
Observed:
`5a rows=27 seq=IN,BSTART,BEND,OUT,IN,… illegal=none unlinked=0 lanes-throw/hang rounds=0`
`5b burst=[IN IN IN* IN* IN* IN*] rows=IN/null`
**HELD.** Every stored sequence is a legal state machine with one IN per burst. Note that conflicting same-instant intents (kiosk "เริ่มพัก" ∥ mobile "กลับจากพัก") legitimately produce a zero-length break, e.g. r0 = IN, BREAK_START and BREAK_END all at 14:00Z.

## P6 — overnight / midnight-ending shift / early window / policy edits
Observed:
- `6a 16–24: 15:59→IN#L/ON_TIME 00:30→OUT#L` HELD
- `6b night+break: 22:05→IN#L 23:50[BREAK_START]→BREAK_START#L 00:20→BREAK_END#L 06:10→OUT#L worked=455` HELD
- `6f bad policy JSON: 14:01→IN#L/ON_TIME` (defaults) HELD
- `6d grace 240→30 mid-session: 16:02→IN#L 00:45→IN`: consistent with the new setting (by design; worth a line in the settings help text)
- `6g unrostered break across midnight: … 00:20→IN`: Q3 / H2.4-D1 debt, not a finding
- `6c IN 1 min before the early window: 13:59→IN/NO_SCHEDULE 16:05→OUT 00:10→IN/NO_SCHEDULE`
- `6e earlyInMin=0: 15:59→IN/NO_SCHEDULE · then 16:01→OUT`

**FINDING MEDIUM.** An IN that misses the early window is never linked to the roster entry. It gets judged NO_SCHEDULE, and the entry looks unattended (H2.5 absent). The after-midnight OUT of a 16–24 shift then comes back as **IN**, so D13b returns for rostered staff. With `earlyInMin=0`, which the settings allow, a 1-minute-early arrival triggers it.
Smallest fix: when an unlinked session is OPEN/ON_BREAK, run `pickRosterEntry` against the employee's entries with `start ≤ now < end + closeGrace` and `last IN.at < end`, and adopt that window for the expiry and the OUT link. Or raise `CLOCK_POLICY_RANGE.earlyInMin` min to ≥ 30 and link any IN that falls within `[start − earlyInMin, end)` of an entry that starts later while the session is open.
```ts
await setPolicy({ earlyInMin: 0, closeGraceMin: 240 });
await entry(e, "2031-09-09", sEve /*16:00–24:00*/, 960, 1440, false);
const i = await cl.clock(ctx, { employeeId: e, kind: "NEXT" }, { now: at("2031-09-09", "15:59") });
const o = await cl.clock(ctx, { employeeId: e, kind: "NEXT" }, { now: at("2031-09-10", "00:30") });
ck("HUNT-6", o.kind === "OUT");   // observed: IN (and i.rosterEntryId === null, judgement NO_SCHEDULE)
```

## Not tested
- `kioskClockAction` / `mobileClockAction` through a real Next request (cookies/session). The action's unit derivation was replicated from source.
- Kiosk token of another HR system: the bound `systemId` arg was not exercised through the action.
- Privacy readers were checked statically only (no hr reader selects lat/lng/accuracyM/deviceId/photoKey; no AI/outbox consumer of HrAttendance outside hr/**). The viewer matrix is already S7.3/S11.
- Tenant-wide PIN bucket of 120/60 s; the shop limit was not reached.
