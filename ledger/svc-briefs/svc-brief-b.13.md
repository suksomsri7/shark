# ใบสั่ง B.13 — ทรัพยากร (ร้านนวด) · ตรวจ: เข้ม 2 รอบ (กันจองซ้อน/ตัวจัดคิว) + perf · ห้ามตัด: กันจองซ้อน (X3) · แยกร้าน (X1)

> อ้างอิง: MASTER-PLAN แถว B.13 (+ กราฟ: B.12 ─► B.13 ─► {B.14 B.15}) · SVC-RUN §1.4 (perf ตัวจัดคิวซ้ำเกณฑ์ B.2) · `DESIGN-BOOKING-QUEUE.md` R7 · §4.2 · §4.4 (แม่แบบนวด: ทรัพยากร "ต้องว่างพร้อมคน" · เก็บห้อง 10–15) · ภาคผนวก ก #3 #13 #14 · ภาพ `design-booking/12-staff-resources.png` (ส่วนทรัพยากร) · `02-calendar-resources.png` (กล่อง "รับ walk-in ตอนนี้ได้ไหม" — จอเป็นของ B.14 · ฟังก์ชันเป็นของใบนี้) · `11-services.png` (คอลัมน์ "ต้องใช้") · README จองคิว (เตียงไทย 5 ปิดซ่อม 1 · โซฟา 3 · ห้องน้ำมัน A/B · ห้องคู่ VIP · ชุดหินร้อน · เก็บห้องน้ำมัน 15)
> CC K12 (`SvcResource` จองเป็นนาทีผ่านตัววางคิว ≠ `RoomOccupancy`) · CC §1.3 (ชั้น RESOURCE) · ใบ B.2 §3–§8 · ใบ B.3 §2–§3 + §6 · ใบ B.4 §2 §3.8 (J1–J5) · ใบ B.7 (`rescheduleBySelf`) · `/root/svc-runs/fix/b3.md` (G1–G7) · `b4.md` (J1–J6)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.13.mts» — รับใบ = **ผ่านทุกข้อ ไม่มี SKIP** (นับจาก `JSON_SUMMARY` · SKIP ที่ยอมระหว่างทำ: V-1 ไม่มี QC_BASE · Q-* ยังไม่ seed · G-* เมื่อ `--no-regression` · SF-1 หลัง merge)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.13.mts [--no-regression]` (ห้าม `timeout` ครอบ · ลูกโพรเซส 5 ตัว + fuzz ~28k + ท้ายชุดรัน regression เอง — นาน)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม prisma generate · ห้ามแตะ `prisma/**`/migration (คอลัมน์ขาด = หยุด รายงานผู้คุม — ดู §10) · ห้ามแก้ข้อสอบ/`scripts/` (ยกเว้นไฟล์ฉาก §8)** · รายงานต่อข้อ (id → ผล)

## 0. ภาพรวม
ร้านนวดต้องว่าง **ทั้งคน และ ห้อง/เตียง/อุปกรณ์** · บริการประกาศ "ชนิด" ที่ต้องใช้ (ห้อง · เตียง · โซฟา · ห้องคู่ · อุปกรณ์ …) · ทรัพยากรมีความจุ (ห้องคู่ = 2) · เวลาเก็บห้อง (กินห้อง ไม่กินคน) · ปิดซ่อมเป็นช่วงเวลา · ทุกทางที่วาง/ย้ายงาน (จองออนไลน์ · ร้านจองให้ · ทางเดิม · เลื่อน · ปลุกนัด · walk-in · ตัววางคิว · เริ่มงาน) ต้องผ่านด่านเดียวกันใต้ล็อก · ร้านที่ไม่ได้ตั้งค่า = พฤติกรรม B1 ทุกไบต์ (ร้านตัดผมไม่เปลี่ยน)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ SF-1 ไล่ `git status` · accept-time)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/booking/resource-kinds.ts» (ใหม่ · **pure** ไม่มี import ค่า) | §3.2 ชนิด + ป้ายไทย |
| «src/lib/modules/booking/resources.ts» (ใหม่) | §3.3 CRUD · ปิดซ่อม · `walkInNowByService` · ตัวช่วยอ่าน/ล็อกทรัพยากรใน tx (ให้ service/queue-line/planner-run เรียก) |
| `src/lib/modules/booking/planner.ts` + «planner-*.ts» (pure) | §3.1 ขยายสัญญา B.2 แบบ optional — ไม่ส่งทรัพยากร = ผลเดิมทุกไบต์ (b.2 93 ข้อต้องเขียว) |
| `src/lib/modules/booking/service.ts` | §3.5 `findSlots` · `bookAppointment` · `createAppointment` (เฉพาะบริการที่ประกาศชนิด) · `setAppointmentStatus` (ปลุกนัด) · `rescheduleBySelf` · `BookFailCode` + `"BUSY"` |
| `src/lib/modules/booking/queue-line.ts` · `planner-run.ts` | §3.5 walk-in · startJob (J3) · rescheduleByShop · runPlanner ใส่ทรัพยากร/เขียน resourceId |
| `src/lib/modules/booking/index.ts` | re-export ได้ |
| `src/lib/core/settings/service.ts` | **core-fix (ruling R3)** ชั้น RESOURCE — เพิ่มบรรทัดเท่านั้น (SF-3) แบบ B.6 DEVICE |
| `src/lib/core/settings/defs/booking.ts` | **core-fix (ruling R3)** คีย์ `booking.service.resourceKinds` (+ป้าย/กลุ่ม) — เพิ่มเท่านั้น (SF-4) · (+ `booking.resource.maintenance` ถ้า ruling R1 = ทาง C) |
| `src/lib/modules/booking/settings-model.ts` · `src/components/booking/settings/booking-settings-shared.ts` · `BookingServicesSettings.tsx` · `BookingStaffSettings.tsx` · «BookingResources.tsx» (ใหม่) | §3.6 จอ 12 ส่วนทรัพยากร · จอ 11 คอลัมน์ "ต้องใช้" |
| `src/app/app/u/[unitSlug]/booking/staff/page.tsx` (· `services/page.tsx` ถ้าจำเป็น) | §3.6 |
| `src/lib/actions/booking-settings.ts` · `src/lib/modules/booking/access.ts` | §3.6 action 3 ตัว + ผูกสิทธิ์ `booking.settings.edit` |
| «scripts/svc-qc-resource-scene.mts» (ใหม่ · builder เขียน) | §8 ฉาก svcqc |

ห้ามแตะ: `prisma/**` · `src/lib/core/**` อื่นนอกสองไฟล์ข้างบน · `plan-settings.ts` · `staff-hours.ts` · `today-line.ts` · `line-ops.ts` · `public-line.ts` · `online.ts` · `deposit.ts` · `finish.ts` · POS/HR · 3 ทะเบียน event (ใบนี้ **ไม่มี event ใหม่**) · ข้อสอบ/`scripts/svc-qc-data.mts` (บล็อก B.13 ผู้คุมตั้งแล้ว)
> line-ops (ย้ายหมอ B.5) / public-line (เลื่อนบัตร B.6) เรียก `planAndWriteTx`/`lockUnitTx` ของ planner-run อยู่แล้ว ⇒ ได้ทรัพยากรผ่าน planner-run โดยไม่ต้องแตะไฟล์ — ถ้าพบว่าต้องแตะ = หยุด รายงานผู้คุม

## 2. หลักการ (ข้อสอบตรวจทุกข้อ)
- **ด่านเดียว**: "ทรัพยากรว่างไหม" คำนวณจากกติกา §4 ชุดเดียว (pure ใน planner-* ใช้ร่วมกับ service ได้) · ห้ามมีสองสูตรที่ให้ผลต่างกันระหว่าง findSlots / bookAppointment / walk-in / ตัววางคิว
- **บังคับที่ฐาน ใต้ล็อก ตรวจ→เขียนใน tx เดียว** (§5) · ตัวกันในหน่วยความจำ = แดง (ข้อสอบยิง 5 โพรเซส)
- **ห้าม connection ที่สองขณะถือล็อก** (B.3 G2): ค่าตั้ง (ชนิดที่บริการต้องใช้) / โปรไฟล์หมอ อ่านก่อน tx · แถว `SvcResource` + ช่วงปิดซ่อม + แถวนัดที่ถือทรัพยากร **อ่านใน tx ผ่าน tx หลังล็อก** (ไม่งั้นปิดซ่อม/ลดความจุพร้อมกันหลุด)
- **ไม่ throw ออกจาก facade**: 40P01/40001/P2028 ⇒ ลองใหม่ภายใน 1 ครั้ง ⇒ `{ ok:false, code:"BUSY", reason:"ระบบกำลังยุ่ง กรุณาลองใหม่" }` — **เกณฑ์รับคือ deadlock ของฐาน = 0** (X-9) การลองใหม่เป็นแค่ตาข่าย
- **CAS** ทุกการเขียนสถานะ/ห้องของแถวนัด (`updateMany where {id, status, …}`) ตามวินัย B.3 G7 / B.4
- **_fallback**: บริการที่ resolve `booking.service.resourceKinds` = `[]` ⇒ ไม่แตะตาราง `SvcResource` เลยในทางนั้น (ไม่ล็อก ไม่อ่าน) — ผลเท่ารุ่น B1 ทุกไบต์ · แถวทรัพยากรที่มีอยู่แต่ไม่มีบริการไหนประกาศชนิด = ไม่มีผล (FZ-4 · E-1 · E-2)
- เวลาไทยผ่าน `localToUtc`/`bkk*` · ห้าม `getDay()/getHours()` ดิบ · ข้อความไทยไม่โทษผู้ใช้ · ไม่มี `any` · zod v4

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ field ต้องตรง)

### 3.1 ตัววางคิว (pure · ขยาย B.2 §3 แบบ optional)
```ts
export type PlanResource = {
  id: string; kind: string; name: string; sortOrder: number;
  capacity: number;     // ≥ 1 · งานถือพร้อมกันได้ไม่เกินนี้
  cleanupMin: number;   // เก็บห้องหลังจบบริการ — กินทรัพยากร ไม่กินหมอ (หมอยังใช้ gap ของ B.2 = max(bufferAfterMin, minBreak))
  blocks: { startAt: number; endAt: number }[];   // ปิดซ่อม (ตัดเฉพาะวันนั้นแล้ว) · ทรัพยากร active=false ⇒ ตัวห่อไม่ส่งมา
};
PlanService  += resourceKinds?: string[]   // ไม่ส่ง/[] = ไม่ใช้ทรัพยากร
PlanJob      += resourceIds?: string[]     // นัด: ที่ถืออยู่ในฐาน (ข้อเท็จจริง) · walk-in: ไม่ผูกมัด (ตัววางคิววางใหม่ได้)
PlanInput    += resources?: PlanResource[]
PlannedJob   += resourceIds: string[]; resourceShort: boolean   // ทุกงานมีเสมอ ([] / false เมื่อไม่ใช้)
PlanReason   += "NO_RESOURCE"
WalkInQuote  += resourceIds: string[]; limitedBy: "NONE" | "STAFF" | "RESOURCE" | "BOTH"
```

### 3.2 «resource-kinds.ts» (pure)
```ts
export const RESOURCE_KINDS = ["CHAIR","BED","SOFA","ROOM","COUPLE_ROOM","EXAM_ROOM"…] // ลำดับตายตัว: CHAIR BED SOFA ROOM COUPLE_ROOM EQUIPMENT EXAM_ROOM
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const RESOURCE_KIND_LABELS_TH: Record<ResourceKind, string>; // เก้าอี้ · เตียง · โซฟา · ห้อง · ห้องคู่ · อุปกรณ์ · ห้องตรวจ
```
`defs/booking.ts` ห้าม import โมดูล (pure ของ core) ⇒ คัดลอกรายการชนิดเป็น `z.enum([...])` ในไฟล์ defs — ข้อสอบ T-0 ตรวจว่าเท่ากัน

### 3.3 «resources.ts»
```ts
export type ResourceCtx = { tenantId: string; unitId: string; actorUserId?: string };
export type ResourceActor = { role: "OWNER"|"MANAGER"|"STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string }; // = SettingsActor
export type MaintenanceWindow = { startAt: string; endAt: string | null; note?: string };  // ISO · endAt null = จนกว่าจะปลด
export type ResourceRow = { id; kind; name; capacity; cleanupMin; active; sortOrder; maintenance: MaintenanceWindow[]; underMaintenanceNow: boolean };
export type ResourceFail = "NOT_FOUND" | "BAD_INPUT" | "DUPLICATE" | "IN_USE" | "FORBIDDEN" | "BUSY";
export type ResourceResult = { ok: true; resource: ResourceRow } | { ok: false; code: ResourceFail; reason: string };

export async function listResources(ctx, opts?: { now?: Date }): Promise<ResourceRow[]>;          // เฉพาะหน่วยของ ctx · เรียง sortOrder, createdAt, id · รวม inactive
export async function createResource(actor, ctx, i: { kind; name; capacity?; cleanupMin?; sortOrder? }): Promise<ResourceResult>;
export async function updateResource(actor, ctx, id, patch: Partial<{ kind; name; capacity; cleanupMin; sortOrder; active }>, opts?: { now?: Date }): Promise<ResourceResult>;
export async function setResourceMaintenance(actor, ctx, id, windows: MaintenanceWindow[], opts?: { now?: Date }): Promise<ResourceResult>; // แทนทั้งชุด · [] = ล้าง
export type WalkInNowRow = { serviceId; serviceName; closed: boolean; startAt: Date | null; staffId: string | null; resourceIds: string[]; limitedBy: "NONE"|"STAFF"|"RESOURCE"|"BOTH"; reasonTh: string };
export async function walkInNowByService(ctx, opts?: { now?: Date }): Promise<WalkInNowRow[]>;   // ภาพ 02 กล่อง "รับ walk-in ตอนนี้ได้ไหม"
```
- ลำดับตรวจ: actor ไม่มีสิทธิ์ `booking.settings.edit` ที่หน่วยนั้น (evaluate แบบ `canBookingAction`) ⇒ `FORBIDDEN` → หาแถว `{id, tenantId, unitId}` ไม่พบ/ข้ามร้าน/ข้ามหน่วย ⇒ `NOT_FOUND` **ข้อความเดียวกันทุกกรณี** ("ไม่พบทรัพยากรนี้") → รูปข้อมูล ⇒ `BAD_INPUT` → ใต้ล็อกแถว (`… WHERE id = … FOR UPDATE` แถวเดียว) ตรวจ IN_USE → เขียน
- รูปข้อมูล: `kind ∈ RESOURCE_KINDS` · `name` trim 1–60 · `capacity` int 1–20 (ค่าเริ่ม 1) · `cleanupMin` int 0–240 (ค่าเริ่ม 0) · `sortOrder` int · ชื่อซ้ำในหน่วย ⇒ `DUPLICATE` (P2002 ⇒ ไม่ throw) · ช่วงปิดซ่อม ≤ 20 ช่วง · ISO ที่ parse ได้ · `endAt > startAt` (หรือ null) · note ≤ 100
- **IN_USE** (ห้ามทิ้งนัดลอยฟ้า — ร้านต้องย้ายนัดก่อน · reason ไทยบอกจำนวนนัด): "นัดที่ถือทรัพยากรนี้" = แถวสถานะถือช่อง (ไม่ใช่ CANCELLED/NO_SHOW/DONE) ที่ถือ id นี้ (§4.6) และปลายช่วงถือ > now · `active → false` / เปลี่ยน `kind` ⇒ มีนัดดังกล่าว ⇒ IN_USE · ลด `capacity` / เพิ่ม `cleanupMin` ⇒ คำนวณใหม่แล้วเกินความจุ ณ จุดใด ⇒ IN_USE · ปิดซ่อม ⇒ ช่วงใดทับช่วงถือของนัด (รวมเวลาเก็บ) ⇒ IN_USE · การตรวจทั้งหมดอยู่ใต้ล็อกแถวทรัพยากรเดียวกับที่ทางจองใช้ (§5) ⇒ แข่งกับการจองได้ผลอย่างใดอย่างหนึ่ง (X-5 X-7)
- ไม่มีการลบจริง (`Appointment.resourceId` อ้างถึง) — ปิดใช้แทน
- `walkInNowByService`: หน่วยไม่ใช่ BOOKING แถวเดียว / ctx ไม่ตรงร้าน ⇒ `[]` · ต่อบริการ active ที่รับ walk-in (`booking.service.walkIn.enabled`): สร้าง PlanInput แบบ `runPlanner` (อ่านอย่างเดียว · ไม่ล็อก ไม่เขียน) → `quoteWalkIn` → แถว · `reasonTh`: NONE = "ได้ทันที …" · STAFF ต้องมีคำเรียกผู้ให้บริการของสาขา (`booking.general.providerLabel` เช่น "หมอนวด") และ **ไม่มีคำว่า "ห้อง"** · RESOURCE ต้องมีป้ายไทยของชนิดที่ขาด (เช่น "ห้อง") · BOTH มีทั้งสอง · ไม่มีชื่อ/เบอร์ลูกค้า

### 3.4 ค่าตั้ง (core-fix · ruling R3)
- `booking.service.resourceKinds` · type `table` · ชั้น `["SERVICE"]` · schema `z.array(z.enum(RESOURCE_KINDS)).max(3)` ไม่ซ้ำ · ค่าเริ่ม `[]` ทั้ง BARBER/SPA/CLINIC/_fallback · labelTh "ทรัพยากรที่บริการนี้ต้องใช้" · กลุ่ม `service` (มีป้ายแล้ว) — แม่แบบไม่ตั้งค่าให้ (ร้านประกาศเองรายบริการ = ภาพ 11)
- `booking.service.resourceRule` (#14 เดิม) = ป้ายแสดงผลเท่านั้น · ไม่มีผลต่อการจอง (ไม่ต้องลบ)
- `src/lib/core/settings/service.ts`: `SUPPORTED_SCOPES` + `"RESOURCE"` · `locateMany`: RESOURCE = `svcResource { tenantId, id ∈ ids }` ⇒ `{ unitId, known: { TENANT, UNIT, RESOURCE } }` · `entitiesOfUnit` + ทรัพยากรของหน่วย · **เพิ่มบรรทัดเท่านั้น** (SF-3 — แบบ S-9 ของ B.6) · ผล: `setSettings` ชั้น RESOURCE ได้ · ของร้านอื่น ⇒ NOT_FOUND (T-2)
- เวลาเก็บของทรัพยากร = **คอลัมน์ `SvcResource.cleanupMin` ชนะ** (หลัก B.3 "คอลัมน์เดิมชนะค่าตั้ง") · ค่าตั้ง `booking.service.cleanupMin` ชั้น RESOURCE = ค่าตั้งต้นของทรัพยากรใหม่ในฟอร์มเท่านั้น

### 3.5 เส้นทางที่ต้องผ่านด่านทรัพยากร (บริการที่ประกาศชนิด ≠ [])
| ทาง | ไฟล์ | ทำอะไร |
|---|---|---|
| `findSlots` (ทุกช่อง) | service | ช่องเวลา `t` โผล่เมื่อมีหมอว่าง (กติกา B.3) **และ** ทรัพยากรครบทุกชนิดว่าง `[t, t+dur+cleanup_r)` (§4) · ใครก็ได้ = รวม |
| `bookAppointment` (ทุกช่อง · รวม `bookOnline`) | service | ใต้ล็อก §5 ตรวจซ้ำ → เลือกทรัพยากร (§4.4) → เขียน `resourceId` = ชิ้นของชนิดแรก + `policySnapshot.job.resourceIds` = ทุกชิ้นตามลำดับชนิด · ไม่ว่าง ⇒ `FULL` (SELF: `FULL_REASON` ข้อความเดียวกับหมอไม่ว่าง — S-8 · ร้านจองให้: ข้อความบอกว่าห้อง/เตียงไม่ว่างได้) |
| `createAppointment` (ทางเดิม · AI proposals) | service | **ruling R5**: บริการที่ประกาศชนิด ⇒ ด่านเดียวกันใต้ล็อกเดิม (`BookingStaff FOR UPDATE` → ทรัพยากร) · ไม่ว่าง ⇒ `{ ok:false, reason ไทย }` · บริการไม่ประกาศชนิด ⇒ ทุกไบต์เดิม |
| `setAppointmentStatus` ปลุก CANCELLED/NO_SHOW → ถือช่อง | service | ทรัพยากรเดิมยังว่าง ⇒ คง · ไม่ว่าง ⇒ เลือกใหม่ชนิดเดียวกัน · ไม่มีเลย ⇒ `{ ok:false }` แถวไม่เปลี่ยน (S-10) |
| `rescheduleBySelf` · `rescheduleByShop` | service · queue-line | ไม่นับตัวเอง · ทรัพยากรเดิมว่างที่เวลาใหม่ ⇒ คง · ไม่งั้นเลือกใหม่ · ไม่มี ⇒ `FULL` (S-9 · X-4) |
| `createWalkIn` | queue-line | ใต้ `lockUnitTx` → ล็อกทรัพยากร → `quoteWalkIn` (มีทรัพยากร) → `closed` ⇒ `WALKIN_CLOSED` · เขียน `resourceId`/`job.resourceIds` ของแผน |
| `startJob` walk-in (J3) | queue-line | ช่วงใหม่ `[now, now+dur+buf)` ชนหมอ **หรือ** ทรัพยากรที่ถืออยู่ไม่ว่าง (และไม่มีชิ้นอื่นชนิดเดียวกันว่าง) ⇒ `CLASH` ไม่เขียน (W-4) · ได้ชิ้นอื่น ⇒ เขียนชิ้นใหม่ใน CAS เดียว |
| `runPlanner` | planner-run | PlanInput + `resources` (active · blocks ของวัน) + `resourceKinds` ของบริการ + `resourceIds` ของงาน → `planDay` → เขียน walk-in QUEUED: `staffId/startAt/endAt/resourceId/job.resourceIds` (CAS) · นัดที่ยังไม่มีทรัพยากรแต่แผนผูกให้ (`resourceShort=false`) ⇒ เขียน (CAS `resourceId IS NULL`) · นัดที่ `resourceShort=true` ⇒ ไม่เขียน (ร้านเห็นบนจอ B.14) |
| `checkIn` | queue-line | **ไม่ล็อก/ไม่อ่านทรัพยากร** (ล็อกแถวนัดก่อน = ห้ามล็อกทรัพยากรหลัง — §5) · มาสายเข้าแถว ⇒ runPlanner หลัง commit วางให้ (W-6) |
- ช่วงที่แถวถือทรัพยากรในมุม busy ของทุกทาง = §4.6 (J5 ขยายมาถึงทรัพยากร)

### 3.6 จอ (ภาพ 12 ส่วนทรัพยากร · 11 คอลัมน์ต้องใช้)
- หน้า `/app/u/[unitSlug]/booking/staff` ใต้ตารางคน: ตาราง "ห้อง · เตียง · อุปกรณ์" (ทรัพยากร · ชนิด (ป้ายไทย) · รับได้ (คน) · เก็บ/เตรียม · ใช้กับบริการ (ชื่อบริการที่ประกาศชนิดนี้) · สถานะ "ใช้งาน"/"ปิดซ่อมถึง …"/"ปิดใช้") + ปุ่ม "+ เพิ่มทรัพยากร" + แก้แถว + ปิดซ่อม · กล่อง `data-bq-resources` · หัวหน้า "… ทรัพยากร N ชิ้น (ปิดซ่อม k)" · ข้อความใต้ตารางตามภาพ
- หน้าบริการ: ช่อง `booking.service.resourceKinds` มาจาก `SettingsForm` (กติกา 16 · `servicesModel` เพิ่มคีย์) + คอลัมน์ "ต้องใช้" แสดงป้ายไทย
- action ใน `src/lib/actions/booking-settings.ts`: `createResourceAction` · `updateResourceAction` · `setResourceMaintenanceAction` → `assertBookingActionAllowed(…, "<ชื่อ>")` ก่อนอ่าน/เขียน → facade ส่ง actor จาก session · `access.ts` `BOOKING_ACTIONS` ผูก `["booking.settings.edit"]` (SF-6)
- คอมโพเนนต์ client ห้าม import ค่าจาก `@/lib/modules/*` (ยกเว้น `resource-kinds` ที่ pure) / `@/lib/core/db` / `@prisma/client`

## 4. กติกา (ใช้ร่วมทุกทาง · pure)
1. **ช่วงถือ** ของงานบนทรัพยากร r = `[start, start + dur + r.cleanupMin)` — `dur` = นาทีบริการ (เฉพาะคน/งาน) **ไม่รวม** buffer ของหมอ · ช่วงครึ่งเปิด (ชนพอดีขอบ = ไม่ชน: เก็บถึง 11:15 ⇒ เริ่ม 11:15 ได้ — S-2)
2. **ความจุ**: ทุกจุดเวลา จำนวนงานที่ถือ r ≤ `r.capacity` · ความจุ > 1 = ใช้พร้อมกันได้ตรงตัวเลข (S-3 · X-2 · PL-5)
3. **ปิดซ่อม**: ช่วงถือห้ามทับ block (รวมเวลาเก็บ — R-5 "ปิดซ่อม 14:02 ทับเวลาเก็บถึง 14:05") · `active=false` = ไม่มีอยู่สำหรับการจองใหม่
4. **เลือกชิ้น**: ต่อชนิดตามลำดับที่บริการประกาศ เลือกชิ้นแรกตาม `sortOrder, createdAt(id ใน pure), id` ที่ว่าง (first-fit) · หนึ่งชิ้นต่อชนิด · ชิ้นต่างกัน · ชนิดที่หน่วยไม่มีทรัพยากรเลย ⇒ ว่างไม่ได้ (`NO_RESOURCE`/`FULL`/`WALKIN_CLOSED`)
5. **ตัววางคิว (pure)**: ลำดับเดิมของ B.2 ทุกข้อ + (ก) งานกำลังทำ/นัดที่เวลาล็อก = ข้อเท็จจริง: `resourceIds` ที่ส่งมาและถูกต้อง (มีจริง · ชนิดตรง) ⇒ ใช้ตามนั้นแม้ทำให้ล้น (ข้อเท็จจริงชนะ) · นัดที่ไม่มี/ไม่ครบ ⇒ ผูกให้ตามลำดับ `(startAt, id)` ก่อนวาง walk-in · ผูกไม่ได้ ⇒ `resourceShort=true` เวลาไม่ขยับ (PL-10) · (ข) IN_SERVICE ถือถึง `endAt` ของแผน (รวมยืด overrun) + cleanup (PL-11) · (ค) walk-in / มาสายเข้าแถว / BOOKED_EARLY: จุดลง t ต้องผ่านกติกาหมอ B.2 **และ** ทรัพยากรว่าง — ค้นต่อเนื่อง (จุดผู้สมัคร = จุดว่างของหมอ ∪ ปลายช่วงถือ/ปลาย block) เลือก t เร็วสุด เสมอ ⇒ sortOrder/id ของหมอแบบ B.2 · ไม่มีที่ลงวันนี้ ⇒ `UNPLACED` (`NO_RESOURCE` เมื่อชนิดไม่มีชิ้นเลย · อื่น `NO_SLOT_TODAY`) · (ง) ANY ย้ายหมอ = เวลาเดิม ⇒ ทรัพยากรเดิม
6. **ช่วงถือในฐาน** (ทุกทาง + ข้อสอบ `resViolations`): แถวสถานะถือช่อง · ทรัพยากร = `policySnapshot.job.resourceIds` (array) ?? `[resourceId]` ?? `[]` · `dur` = `job.durationMin` ?? `endAt − startAt − (job.bufferMin ?? service.bufferMin)` · ARRIVED ยืดถึง `plannedStartAt + dur` · IN_SERVICE ยืดถึง `startedAt + dur` (J5) · อ่านแถวที่ "ซ้อนช่วง" (ข้ามเที่ยงคืนได้)
7. **limitedBy** (quote · walkInNowByService): `t* = q.startAt` · `staffNow` = quote ของบริการเดียวกันที่ไม่ประกาศชนิด (งานอื่นในแผนเหมือนเดิม) ได้ `= now` · `resNow` = ทุกชนิดมีชิ้นว่าง `[now, now+dur+cleanup)` ⇒ `t* = now` ⇒ NONE · `staffNow ∧ ¬resNow` ⇒ RESOURCE · `¬staffNow ∧ resNow` ⇒ STAFF · ไม่ทั้งคู่ ⇒ BOTH · closed เพราะชนิดไม่มีชิ้นเลย ⇒ RESOURCE · ไม่มีทรัพยากรใด ๆ ในสาขา ⇒ NONE/STAFF เท่านั้น
8. **_fallback** (FZ-4): บริการไม่มีชนิด ⇒ ผล planDay เท่ากับไม่ส่ง `resources` ทุกไบต์ · `resourceIds: []` · `resourceShort: false`

## 5. ล็อก · ลำดับคงที่ทั้งระบบ (กัน deadlock — X-9 นับ `pg_stat_database.deadlocks` ต้องไม่ขยับ)
```
idem (advisory) → เบอร์ (advisory) → [advisory สาขา] → BookingStaff ORDER BY "sortOrder","createdAt",id FOR UPDATE
→ SvcResource ของสาขา ORDER BY "sortOrder","createdAt",id FOR UPDATE → แถว Appointment (FOR UPDATE / CAS) → QueueTicket
```
- **ห้ามล็อก BookingStaff หลังจากถือล็อก SvcResource** · ห้ามล็อก SvcResource หลังถือล็อกแถว Appointment (checkIn/callJob/completeJob/cancel ที่ล็อกแถวก่อน ⇒ ไม่แตะทรัพยากร) · หลายชนิด (หินร้อน = ห้อง + อุปกรณ์) ⇒ ล็อก **ทุกชิ้นของสาขา** (หรือชุดที่ต้องใช้) เรียงลำดับเดียวกัน ไม่ใช่ตามลำดับชนิด (SF-5)
- `bookAppointment` ใครก็ได้ (B.3 ล็อกหมอทีละคน): ทรัพยากรว่างไหมที่เวลา t **ไม่ขึ้นกับหมอ** ⇒ เลือกหมอให้จบใต้ล็อกหมอก่อน แล้วค่อยล็อกทรัพยากร · ทรัพยากรไม่ว่าง ⇒ `FULL` ทันที (ห้ามวนไปล็อกหมอคนถัดไปหลังล็อกทรัพยากร) — หรือใช้ `lockUnitTx` (ล็อกหมอทั้งสาขา) ก่อนสำหรับบริการที่ประกาศชนิด
- CRUD (§3.3) ล็อกแถวทรัพยากรแถวเดียว (ไม่ถือล็อกหมอ) แล้วอ่านแถวนัดแบบไม่ล็อก — ทางจองถือล็อกแถวเดียวกันก่อน insert ⇒ ลำดับเข้ากันได้
- ทุกการอ่านที่ตัดสิน (ทรัพยากร · ปิดซ่อม · แถวนัดที่ถือ) อยู่ **หลังล็อกใน tx เดียวกับการเขียน** · `$transaction` maxWait ≤ 20 000 · timeout ≤ 30 000 (B.3 G2)

## 6. เกณฑ์รับ (เข้ม + perf)
- «scripts/qc-svc-b.13.mts» เขียวทุกข้อ — หมวด **T** (T-0 คีย์ · T-1 ชนิด pure · T-2 ชั้น RESOURCE · T-3 แม่แบบ/ประกาศชนิดผ่านเครื่องยนต์) · **PL** 0–14 (ภาพ 02 ทั้ง 3 แบบ + BOTH · ความจุ 2 · เก็บ 15 · ปิดซ่อม · หลายชนิด · ชนิดไม่มีชิ้น · นัดไม่มีห้อง · overrun · คงห้องนัด · ไม่มีทรัพยากร · ความบริสุทธิ์) · **FZ** 1–6 · **PERF** · **R** 1–6 · **S** 1–11 · **W** 1–8 · **E** 1–2 · **X** dc/0–9 · **Q** 1–4 · **V-1** · **SF** 1–6 · **G** 1–7 · **Z-1**
- **perf (ซ้ำเกณฑ์ B.2 · SVC-RUN §1.4)**: (1) G-1 = `qc-svc-b.2` 93/93 รวม PERF เดิม (12 ช่าง · นัด 120 · walk-in 40 ⇒ p95 < 50 ms · ตอนรับ B.2 worst ≈ 11 ms) — ไม่ส่งทรัพยากรต้องไม่ช้าลงเกินเกณฑ์ (2) PERF ของใบนี้: 12 หมอ · นัด ≥ 120 · walk-in 40 · ทรัพยากร 16 ชิ้น (4 ชนิด · ความจุ 1–3 · ปิดซ่อม 20%) ⇒ **p95 < 50 ms** (200 รอบหลังอุ่น 20) · log พิมพ์ p50/p95/สูงสุด — ผู้คุมจดตัวเลขใน wo-notes (3) fuzz: 6 สมบัติ × 4 000 ชุด seed คงที่ (FZ-4 คู่ ⇒ planDay ≈ 28 000 ครั้ง) · ผู้ตรวจ B รันซ้ำ `QC_B13_FUZZ_N=20000`
- **ข้อสอบตรวจตัวเองแล้ว 31 ต.ค.** (โค้ดก่อน B.13 · 83 ข้อ · log `/tmp/svc-b13-oracle-2.log`): ผ่าน 14 · แดง 61 · SKIP 8 (G-1…7 ยังไม่มีงาน · V-1 ไม่มี QC_BASE) — **เขียวอยู่แล้วและต้องเขียวต่อ 14 ข้อ** = PL-0 · PL-14 · FZ-3 · FZ-4 · FZ-5 · PERF (p50 0.98 · p95 1.59 · สูงสุด 2.18 ms) · E-1 · E-2 · X-dc · X-0 · X-9 · SF-2 · SF-4 · Z-1 · แดงด้วยเหตุที่ถูก: ไม่มี resource-kinds/resources.ts · คีย์ resourceKinds ยังไม่ลงทะเบียน · ชั้น RESOURCE = SCOPE_UNSUPPORTED · planDay/quote ไม่มี resourceIds/limitedBy (วาง walk-in ทับห้อง) · จอง/ทางเดิม/เลื่อน/ปลุก/walk-in ได้ทั้งที่ห้องเต็ม (X-1 ได้ 10/10 · X-2 10/10 · X-6 10/10) · startJob ไม่ CLASH · ไม่มีฉาก/action/หน้า
- typecheck + fitness 2 โหมด (ผู้คุม) · build QC + ภาพ 2 ใบ (จอง 12 ส่วนทรัพยากร · จอง 11) PARITY
- ตรวจเข้ม 2 รอบ (กันจองซ้อน + ตัวจัดคิว) — รายการแข่งให้ผู้ตรวจ B §11

## 7. regression (G) — ข้อ "ไฟล์ของใบ" ของชุดเก่าเป็น accept-time ของใบนั้น ⇒ แดงได้เฉพาะข้อที่ระบุ ระหว่างไฟล์ B.13 ยังไม่ commit
| G | ชุด | เกณฑ์ |
|---|---|---|
| 1 | `qc-svc-b.2` | 93/93 (findings ว่าง · รวม PERF) |
| 2 | `qc-svc-b.3` (`SVC_B3_NO_REGRESSION=1`) | FAIL ได้เฉพาะ ST-1 · SKIP เฉพาะ G-*/ST-1 |
| 3 | `qc-svc-b.4 --no-regression` | FAIL ได้เฉพาะ ST-1/ST-4 (planner.ts ถูกแตะ) |
| 4 | `qc-svc-b.5 --no-regression` | FAIL ได้เฉพาะ S-1/S-2 · SKIP H/E/V/Q/G/S-1 |
| 5 | `qc-svc-b.7 --no-regression` | FAIL ได้เฉพาะ S-1/S-2/S-3 · SKIP H/V/Q/G/S-1 |
| 6 | `qc-svc-b.8 --no-regression` | FAIL ได้เฉพาะ S-1/S-2/S-4 · SKIP H/V/Q/G/S-1 |
| 7 | `qc-svc-smoke` | exit 0 |
- หลัง merge (ไฟล์สะอาด) ทุกชุดต้องกลับมาเขียวรวมข้อ accept-time ที่ข้ามได้ (S-1/ST-1 SKIP) — **ข้อ "ไม่แตะไฟล์" ของ b.4 ST-4 / b.5 S-2 / b.7 S-2 S-3 / b.8 S-2 S-4 จะยังเขียวเพราะเทียบ HEAD** ⇒ ไม่ต้อง ORACLE-EDIT ชุดเก่า

## 8. ฉาก svcqc («scripts/svc-qc-resource-scene.mts» · builder เขียน)
- ด่าน `loadSvcQcEnv` · อ่านจาก `SQC_RESOURCE_SCENE` + `SQC` เท่านั้น (บล็อก B.13 ใน `scripts/svc-qc-data.mts` — ผู้คุมตั้งแล้ว) · ร้าน svcqc หน่วย massage · ผู้กระทำ = เจ้าของ svcqc ผ่าน facade ของใบนี้ + `setSettings` ชั้น **SERVICE** เท่านั้น
- ทำ: ทรัพยากร 12 ชิ้น (id ตายตัว `svcqc-res-*` · ถ้ามีแถว id นั้นแล้วแต่ค่าต่าง ⇒ แก้ให้ตรง) → ปิดซ่อมเตียง 5 (`fromOffsetDays`/`untilOffsetDays` สัมพัทธ์วันนี้ไทย 00:00) → ค่าตั้ง `booking.service.resourceKinds` ของ 6 บริการตามชื่อ
- **ห้ามเขียนค่าตั้งชั้น TENANT/UNIT** (ข้อสอบ Q-4 เทียบแถวก่อน/หลัง) · ไม่สร้างนัด · อยู่ร่วมกับฉาก B.11 (SPA + ค่ารายบริการ) ได้
- idempotent: ครบแล้ว ⇒ 0/0/0 · `--clear` ปิดใช้ทรัพยากรฉาก + ล้างปิดซ่อม + คืนค่าตั้งชั้น SERVICE ที่ฉากตั้ง · บรรทัดท้าย `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}`
- ภาพ: `SQC_VISUAL_SPECS["b.13"]` (staff?staff=พี่นก · services?service=น้ำมันอโรมา) · ลำดับก่อนถ่าย: seed → ฉาก B.11 → ฉาก B.13

## 9. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. ภาพ 11 "ห้องน้ำมัน" / "เตียงไทย" = **ชนิด** (ROOM/BED) ไม่ใช่กลุ่มย่อยที่ร้านตั้งชื่อเอง — ร้านที่มีห้องสองแบบในชนิดเดียวกัน (ห้องน้ำมัน vs ห้องซาวน่า) แยกไม่ได้ในรุ่นนี้ (หนี้ → ruling R6)
2. ภาพ 12 คอลัมน์ "ใช้กับบริการ" = **อนุมาน** จากบริการที่ประกาศชนิดนั้น (ไม่เก็บคู่ทรัพยากร↔บริการแยก)
3. ความจุ > 1 = ใช้พร้อมกันโดยงานอิสระ (ห้องคู่รับ 2 นัดคนละคู่ได้) — การจองเป็นกลุ่ม/ห้องเดียว = B.15
4. เวลาเก็บ = ของทรัพยากร (`cleanupMin` คอลัมน์) · buffer ของบริการ = ของหมอเหมือนเดิม — "เก็บห้อง" บนภาพ 11 ของบริการ = `bufferMin` เดิม (ไม่ซ้อนกัน)
5. ปิดซ่อมเป็น **ช่วงเวลา** (ภาพ "ปิดซ่อมถึง 5 พ.ย.") หลายช่วงได้ (≤ 20) · `active=false` = ปิดถาวร · ปิดซ่อม/ปิดใช้/ลดความจุ ที่ทับนัดอนาคต ⇒ `IN_USE` (ไม่ย้ายนัดเอง)
6. ตัวควบคุมเหตุผล "คนไม่ว่าง vs ห้องไม่ว่าง" = §4.7 (ไม่ใช่ข้อความอิสระ) — ข้อความไทยอิสระแต่ต้องมีคำตามที่ระบุ
7. นัดเก่าก่อนประกาศชนิด (ไม่มี resourceId) ⇒ ตัววางคิวผูกให้ถ้าว่าง · ไม่ว่าง ⇒ `resourceShort` (ไม่ยกเลิก/ไม่ย้าย) · `findSlots`/`bookAppointment` นับนัดเหล่านี้ตามที่ผูกแล้วในฐานเท่านั้น (นัดที่ยังไม่ผูก = ไม่ถือทรัพยากร) — ร้านควรประกาศชนิดก่อนเปิดจอง (คู่มือ C.2)
8. ช่อง SELF เห็นแค่ "เต็ม" (§4.3 ของแบบ) · ร้านจองให้เห็นเหตุผลห้อง/เตียงได้
9. `walkInNowByService` ไม่ล็อก (มุมมอง) — ผลจริงตัดสินตอน `createWalkIn`
10. ข้อสอบ S-4 ปิดใช้เตียง 2 ด้วย SQL ตรง (ไม่ใช่ facade) เพื่อแยกด่านจองออกจากด่าน IN_USE — คืนค่าใน finally

## 10. คำขอ ruling (ผู้คุม/เจ้าของ เคาะก่อนปล่อย builder)
- **R1 [schema — ปิดซ่อม]** B.0 สร้าง `SvcResource(kind, name, capacity, cleanupMin, active, sortOrder)` แล้ว **แต่ไม่มีที่เก็บช่วงปิดซ่อม** · กติกาเหล็กข้อ 5: migration มีได้เฉพาะ R0.1/B.0/D.0 ⇒ ใบนี้ไม่ทำ migration เอง · ทางเลือก:
  - **ทาง A (แนะนำถ้าเจ้าของยอมข้อยกเว้น)**: migration เพิ่มอย่างเดียว «svc_b13» ตาราง `SvcResourceBlock(id, tenantId, unitId, resourceId, startAt, endAt?, note?, createdAt)` + `@@index([resourceId, startAt])` (ไม่มี FK แบบ B.0) — ปิดซ่อม/ตรวจ IN_USE/เขียน อยู่ใน tx เดียวใต้ล็อกแถวทรัพยากร · ทางจองอ่านใน tx ได้ตรง ๆ
  - **ทาง C (ไม่มี migration)**: ค่าตั้ง `booking.resource.maintenance` ชั้น RESOURCE (กลุ่มใหม่ `resource` ป้าย "ทรัพยากร") · ทางจองอ่านช่วงปิดซ่อม **ใน tx หลังล็อก** จาก `SettingValue` ผ่าน tx (ไม่ใช่ resolver นอก tx) · `setResourceMaintenance` = `setSettings` ก่อน → tx ล็อกแถวทรัพยากร ตรวจนัดที่ทับ → ทับ ⇒ คืนค่าเดิมด้วย `setSettings` แล้วตอบ `IN_USE` (ช่วงชั่วคราวเข้มขึ้นเท่านั้น ไม่หลวม) — ซับซ้อนกว่าและมีประวัติค่าตั้งเกิน 1 แถว
  - ข้อสอบเป็นกลางทั้งสองทาง (ตรวจผ่าน `setResourceMaintenance`/`listResources`/ผลการจอง · X-7 ตรวจแข่งปิดซ่อม∥จอง) — ถ้าเลือก A ⇒ SF-2 ต้อง ORACLE-EDIT ให้ยอมไฟล์ migration ของใบ
- **R2 [schema — หลายชนิดต่องาน]** `Appointment.resourceId` เดียว (B.0) · บริการหินร้อน = ห้อง + อุปกรณ์ ⇒ เก็บครบใน `policySnapshot.job.resourceIds` (เพิ่มคีย์แบบ B.4 J4/J6) + `resourceId` = ชิ้นชนิดแรก (ปฏิทิน B.14/ดัชนี) · หนี้ดัชนี: ค้น "นัดที่ถือ r" จาก JSON = สแกนนัดของสาขาในช่วง (ปริมาณร้านนวดเล็ก) → partial index/ตารางเชื่อมใน migration ถัดไป
- **R3 [core-fix]** ใบนี้แตะ `src/lib/core/settings/service.ts` (ชั้น RESOURCE — แบบ B.6 Q1) และ `defs/booking.ts` (เพิ่มคีย์ `booking.service.resourceKinds`) — ไฟล์ชิ้นกลาง ⇒ ต้องมีมติผู้คุม (ตรวจเข้ม · เพิ่มอย่างเดียว · SF-3/SF-4)
- **R4** `BookFailCode` + `"BUSY"` (เพิ่มท้าย) — `bookAppointment` ลองใหม่ 1 ครั้งเมื่อ 40P01/40001/P2028 แล้วคืน BUSY (B.3 ไม่มีรหัสนี้) · `createAppointment` ทางเดิมคืน `{ok:false, reason}` เหมือนเดิม
- **R5** `createAppointment` (B.3: "ทุกไบต์เดิม") เปลี่ยนเฉพาะบริการที่ประกาศชนิด — ไม่งั้นทางเดิม (AI proposals) จองห้องซ้อนได้ (X-6 · S-11)
- **R6** ชนิดคงที่ 7 ชนิด (ไม่มีกลุ่มย่อยที่ร้านตั้งเอง) — ถ้าเจ้าของต้องการ "ห้องน้ำมัน" แยกจาก "ห้องอื่น" ในชนิด ROOM ⇒ เพิ่มชนิดภายหลัง (เพิ่ม enum ได้ไม่ต้อง migrate) หรือ ruling ให้ `kind` เป็นข้อความอิสระ
- **R7** ใบนี้ไม่มี event ใหม่ (สร้าง/แก้ทรัพยากร = audit ตามแบบค่าตั้งเท่านั้น) — ถ้าต้องการ webhook ทรัพยากร ⇒ ใบหลัง

## 11. รายการแข่ง (race list) ให้ผู้ตรวจ B — probe ข้ามโพรเซส ≥ 10 ทาง · ดู `pg_stat_database.deadlocks` ก่อน/หลังทุก probe
1. ห้องเดียว: `bookAppointment` SPECIFIC ต่างหมอ ×10 (STAFF+ONLINE+LINE) ⇒ 1 (X-1) · ซ้ำ 20 รอบ
2. **ใครก็ได้ × ระบุหมอ**: ANY ×5 + SPECIFIC ×5 ห้องเดียว — จับวงรอ "ถือหมอ A → รอทรัพยากร" ∥ "ถือทรัพยากร → รอหมอ B" (§5 ข้อ ANY)
3. หลายชนิด: หินร้อน (ROOM+EQUIPMENT) ∥ น้ำมัน (ROOM) ∥ บริการอุปกรณ์ล้วน ×10 — ลำดับล็อกตามลำดับชนิดจะ deadlock · ต้องตาม sortOrder
4. walk-in ×5 ∥ `bookAppointment` ×5 ห้องเดียวเวลาใกล้กัน ⇒ ฐานไม่ล้น
5. `checkIn` (ล็อกแถวนัดก่อน) ×N ∥ `runPlanner` วน (หมอ→ทรัพยากร→แถว) — แบบ B.4 X-6 บนบริการที่ใช้ห้อง ⇒ deadlock 0
6. `startJob` walk-in (ย้ายมาเริ่มตอนนี้) ∥ จองห้องเดียวกันที่ now ⇒ CLASH หรือจองแพ้ ไม่ได้ทั้งคู่
7. `rescheduleByShop` ×5 ∥ `rescheduleBySelf` ×5 ∥ จองใหม่ ไปช่องเดียว ⇒ 1 (X-4) · เลื่อนทับตัวเอง (ไม่นับตัวเอง)
8. ปลุกนัด (`setAppointmentStatus` CANCELLED→CONFIRMED) ∥ จองห้องเดียวกัน ⇒ ได้อย่างใดอย่างหนึ่ง
9. ทางเดิม `createAppointment` ×5 ∥ ทางใหม่ ×5 ⇒ 1 (X-6)
10. `updateResource` (ลดความจุ / เพิ่มเวลาเก็บ / ปิดใช้ / เปลี่ยนชนิด) ∥ จอง ×9 ⇒ ความจุสุดท้ายไม่ถูกละเมิด (X-5) · ทำซ้ำทุก patch
11. `setResourceMaintenance` ∥ จอง ×9 ⇒ ปิดซ่อมสำเร็จ ⇒ ไม่มีนัดในช่วง · IN_USE ⇒ มีนัด 1 (X-7) — ทาง C: probe ช่วงระหว่าง setSettings กับการตรวจ (ต้องไม่หลวม)
12. `runPlanner` ×2 โพรเซสพร้อมกัน + walk-in เข้าใหม่ ⇒ แถว QUEUED ไม่ถือห้องซ้อน (advisory สาขา)
13. `expireDepositHolds` ปล่อยนัดถือมัดจำ ∥ จองห้องที่ถูกปล่อย ∥ `recordDeposit` ปลุกไม่ได้ (B.3 G4) — ห้องไม่ซ้อน
14. `runLineTick` ไม่มา (ปล่อยห้อง) ∥ เช็กอินมาสาย (ยังถือห้อง) ⇒ ผลอย่างใดอย่างหนึ่ง (B.4 X-5 บนบริการใช้ห้อง)
15. B.5 ย้ายหมอ (line-ops) / B.6 เลื่อนบัตร (public-line) ∥ จอง — ทางเหล่านี้ไปผ่าน planner-run: ต้องไม่ย้ายงานไปห้องที่ไม่ว่าง
16. ขอบเวลา: เริ่มพอดีปลายเวลาเก็บ (ได้) · ปลายพอดีต้นปิดซ่อม (ได้) · ความจุเต็มพอดี (คนสุดท้ายได้ · คนถัดไปไม่ได้)
17. ข้ามเที่ยงคืน: IN_SERVICE 23:30 เลยเวลาถือห้องถึงวันถัดไป (J5) ∥ จอง 00:05 (TZ −11/+14)
18. ข้ามร้าน: id ทรัพยากรร้านอื่นใน CRUD/ค่าตั้งชั้น RESOURCE ⇒ NOT_FOUND เดียวกัน · `walkInNowByService` ctx ผสม ⇒ [] · ไม่มี id ห้องร้านอื่นในแถวนัด
19. 40P01 รวมทุก probe = 0 · BUSY เกิดได้เฉพาะใต้โหลดหนัก (ตาข่าย) ไม่ใช่ทางปกติ

## 12. ส่งต่อใบหลัง
- **B.14** ปฏิทินตามคน/ตามห้อง: ใช้ `resourceId`/`job.resourceIds` + `walkInNowByService` (กล่องภาพ 02) + `resourceShort` · ลากย้ายห้อง = `rescheduleByShop` + เลือกห้อง (ต้องเพิ่ม opt `resourceIds` — ด่านเดียวกัน)
- **B.15** คู่รัก/กลุ่ม: ห้องคู่ความจุ 2 ⇒ กลุ่มเดียวใช้ทั้งห้อง (atomic ทุกคน+ห้อง) — ใช้ล็อก §5 เดียวกัน
- **C.2** คู่มือร้าน: ประกาศชนิดของบริการก่อนเปิดจอง (§9 ข้อ 7)
- หนี้: ดัชนีนัด↔ทรัพยากร (R2) · กลุ่มย่อยของชนิด (R6) · ปิดซ่อมแบบตารางถ้าเลือกทาง C (R1)

## มติผู้คุม (31 ต.ค. 2569)
- **R1 ✅ ทาง A** ข้อยกเว้นกติกาข้อ 5 (แบบเดียวกับ D.4 svc_d4): migration เพิ่มอย่างเดียว `svc_b13` ตาราง `SvcResourceBlock` (tenantId · unitId · resourceId · startAt · endAt · reason · createdById · timestamps · ดัชนี (tenantId, resourceId, startAt)) · ไม่มี DROP/ALTER ตารางเดิม · ลง deploy checklist · `prisma migrate diff` อ่าน SQL ทุกบรรทัด · ลงฐาน QC **ทุกฐานที่ใช้**: ฐานเลน l3 (ตอนทำ) + ฐานหลัก + ฐานเลน l1/l2 (ผู้คุมลงตอน merge) · generate เฉพาะ nm-l3 · ⚖️ ORACLE-EDIT SF-2 ตามทาง A (builder ทำ ติดป้าย `// ORACLE-EDIT (ผู้คุม 31 ต.ค. · b13-R1)`)
- R2 ✅ resourceIds ใน policySnapshot.job (ดัชนี = หนี้) · R3 ✅ core-fix เพิ่มอย่างเดียว (settings/service ชั้น RESOURCE แบบ B.6 · defs/booking resourceKinds) ⇒ ตรวจเข้มส่วนนี้ · R4 ✅ BUSY · R5 ✅ เปลี่ยนเฉพาะบริการที่ประกาศชนิด · R6 ✅ 7 ชนิดคงที่ · R7 ✅ ไม่มี event ใหม่
- ลำดับล็อก §5 = ผูกพัน · deadlock ของฐาน = 0 เป็นเกณฑ์รับ
