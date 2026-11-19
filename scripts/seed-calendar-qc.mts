// seed-calendar-qc.mts — ข้อมูล QC ของ RUN "ปฏิทินเลขา" (ใบ CAL0.2 · สัญญา docs/modules/32-secretary-calendar.md §13)
//
// ใช้ (ฐาน QC ของเลขา wo-sec-qc ผ่านตัวครอบเดิม · seed ไม่ถือล็อกเอง):
//   bash scripts/iso.sh bash /root/projects/shark-sec/scripts/qc-sec.sh bash -c \
//     'cd /root/projects/shark-sec-ui && bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/seed-calendar-qc.mts'
//   (qc-sec.sh อ่าน .env.qc-sec ของทรีตัวเอง ตรวจ host แล้วตั้ง SEC_QC_HOST · ทรีนี้ไม่มีไฟล์ env)
//   วันอ้างอิง = วันไทยตอนรัน · บังคับได้ด้วย CAL_QC_DAY=YYYY-MM-DD
//
// สร้างอะไร (id ขึ้นต้น `calqc-` ทั้งหมด):
//   • ร้าน A "CALQC Siam Dive" (หน่วย BOOKING + TICKET · ระบบ CRM v2 · KANBAN · ACCOUNT · HR) · ร้าน B "CALQC Homestay" (หน่วย DORM · ACCOUNT)
//   • ผู้ใช้ 3: เจ้าของ (OWNER ทั้ง A/B) · ครูนิว (STAFF A · ผูก HR+BookingStaff) · ครูบอส (MANAGER A + STAFF B)
//   • ทุกแหล่งของ agenda: นัด · กิจกรรม CRM · การ์ดบอร์ด · ใบแจ้งหนี้/WHT · รอบเงินเดือน+ใบลา · บิลหอพัก · อีเวนต์ตั๋ว
//   • CalItem/CalPref — ตรวจจาก client ตอนรัน: ยังไม่มีโมเดล (ก่อน CAL1.1) ⇒ พิมพ์ TODO(CAL1.1) แล้วข้าม (ไม่อ้างตอน compile)
//
// กติกา (แบบ seed-secretary-qc):
//   🔴 id ตายตัว · อ่านเทียบก่อนเขียน · รันซ้ำวันเดียวกัน = ไม่มีการเขียน · รันวันอื่น = แก้วันที่ (ไม่เพิ่มแถว)
//   🔴 แถว id เดียวกันแต่อยู่ร้านอื่น = หยุด (ไม่แตะ) · ลบได้เฉพาะ CalItem/CalPref เกินของร้าน calqc (ตารางที่ seed นี้เป็นเจ้าของ)
//   🔴 ไม่ส่ง push · ไม่เรียกโมเดล · ไม่แตะ Google (CalLink ไม่ seed — ข้อสอบใช้ transport ปลอม)
import { loadSecQcEnv } from "./sec-qc-env.mjs";
import type { Prisma } from "@prisma/client"; // ชนิดล้วน (ลบทิ้งตอนรัน)

// ด่านฐาน: ไม่ใช่ฐาน QC ของเลขา (prod / QC ของ RUN อื่น / host อื่น / ไม่มี env) ⇒ exit 4 ก่อนแตะฐาน
loadSecQcEnv("seed-calendar-qc");

const { prisma } = await import("@/lib/core/db");
const { Prisma: PrismaNs } = await import("@prisma/client");

const t0 = Date.now();
const created: Record<string, number> = {};
const updated: Record<string, number> = {};
const removed: Record<string, number> = {};
const bump = (m: Record<string, number>, k: string, n = 1) => {
  if (n > 0) m[k] = (m[k] ?? 0) + n;
};

// ═══════════════ เวลา (วันไทย · UTC+7 คงที่) ═══════════════
const BKK_MS = 7 * 3_600_000;
const dayArg = process.env.CAL_QC_DAY ?? "";
if (dayArg && !/^\d{4}-\d{2}-\d{2}$/.test(dayArg)) throw new Error(`CAL_QC_DAY ต้องเป็น YYYY-MM-DD (ได้ "${dayArg}")`);
const DAY0 = dayArg || new Date(Date.now() + BKK_MS).toISOString().slice(0, 10);
const [Y0, M0, D0] = DAY0.split("-").map(Number) as [number, number, number];
/** เวลาไทย วัน DAY0+off HH:MM → UTC */
const bkk = (off: number, hh = 0, mm = 0) => new Date(Date.UTC(Y0, M0 - 1, D0 + off, hh - 7, mm));
/** วันล้วน (@db.Date) ของ DAY0+off */
const dateOnly = (off: number) => new Date(Date.UTC(Y0, M0 - 1, D0 + off));
const ymKey = (monthOff: number) => {
  const d = new Date(Date.UTC(Y0, M0 - 1 + monthOff, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
/** วันที่ D ของเดือน (DAY0 + monthOff) เวลาไทย HH:MM */
const dayOfMonth = (monthOff: number, d: number, hh = 0) => new Date(Date.UTC(Y0, M0 - 1 + monthOff, d, hh - 7));
const PERIOD_NOW = ymKey(0);
const PERIOD_PREV = ymKey(-1);
/** วันจันทร์ถัดไป (ไม่รวมวันนี้) 09:00 ไทย */
const dow0 = new Date(Date.UTC(Y0, M0 - 1, D0)).getUTCDay();
const nextMonday9 = bkk(((1 - dow0 + 7) % 7) || 7, 9);
const ACCEPTED_AT = new Date("2026-11-01T00:00:00.000Z");

// ═══════════════ ตัวช่วย idempotent ═══════════════
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) && !(x instanceof Date)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
function diff(cur: Record<string, unknown>, want: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(want)) if (canon(cur[k]) !== canon(want[k])) out[k] = want[k];
  return out;
}
const has = (o: object) => Object.keys(o).length > 0;

type Row = Record<string, unknown>;
/** delegate แบบหลวม — ข้อมูลทุกก้อนตรวจชนิดด้วย `satisfies Prisma.<Model>UncheckedCreateInput` ตรงที่ประกาศ */
type Delegate = {
  findUnique(a: { where: { id: string } }): Promise<Row | null>;
  create(a: { data: Row }): Promise<unknown>;
  update(a: { where: { id: string }; data: Row }): Promise<unknown>;
};
const del = (d: unknown) => d as Delegate;

/**
 * แถวตาม id: ไม่มี = สร้าง · มี = แก้เฉพาะช่องที่ต่าง · `tenantId` ของแถวเดิมต้องตรง (ไม่งั้นหยุด)
 * `keep` = ช่องที่ใส่ตอนสร้างเท่านั้น (ไม่เทียบภายหลัง — เช่นค่าที่ระบบเขียนทับเอง)
 */
async function ensure(label: string, d: Delegate, data: Row & { id: string }, keep: string[] = []) {
  const row = await d.findUnique({ where: { id: data.id } });
  if (!row) {
    bump(created, label);
    await d.create({ data });
    return;
  }
  if ("tenantId" in data && row.tenantId !== data.tenantId) throw new Error(`${label} ${data.id} เป็นของร้านอื่น (${String(row.tenantId)}) — ไม่แตะ หยุด`);
  const want: Row = {};
  for (const [k, v] of Object.entries(data)) if (k !== "id" && !keep.includes(k)) want[k] = v;
  const dd = diff(row, want);
  if (has(dd)) {
    bump(updated, label);
    await d.update({ where: { id: data.id }, data: dd });
  }
}

// ═══════════════ สัญญาข้อมูล (CAL) ═══════════════
const A = "calqc-tenant";
const B = "calqc-tenant-b";
const TENANTS = [
  { id: A, slug: "cal-qc", name: "CALQC Siam Dive" },
  { id: B, slug: "cal-qc-b", name: "CALQC Homestay" },
] as const;

const UNIT = {
  dive: { id: "calqc-unit-dive", tenantId: A, type: "BOOKING" as const, name: "ศูนย์ดำน้ำ (CALQC)", slug: "calqc-dive" },
  ticket: { id: "calqc-unit-ticket", tenantId: A, type: "TICKET" as const, name: "ทริปขายบัตร (CALQC)", slug: "calqc-ticket" },
  dorm: { id: "calqc-unit-dorm", tenantId: B, type: "DORM" as const, name: "หอพัก (CALQC)", slug: "calqc-dorm" },
};
const SYS = {
  crm: { id: "calqc-sys-crm", tenantId: A, type: "CRM" as const, name: "ลูกค้าสัมพันธ์ (CALQC)", settings: { crm: { uiVersion: 2 } } },
  kanban: { id: "calqc-sys-kanban", tenantId: A, type: "KANBAN" as const, name: "บอร์ดงาน (CALQC)", settings: {} },
  account: { id: "calqc-sys-account", tenantId: A, type: "ACCOUNT" as const, name: "บัญชี (CALQC)", settings: {} },
  hr: { id: "calqc-sys-hr", tenantId: A, type: "HR" as const, name: "พนักงาน (CALQC)", settings: {} },
  accountB: { id: "calqc-sys-account-b", tenantId: B, type: "ACCOUNT" as const, name: "บัญชีหอพัก (CALQC)", settings: {} },
};

type Who = "owner" | "new" | "boss";
const USERS: Record<Who, { id: string; email: string; name: string }> = {
  owner: { id: "calqc-owner", email: "calqc-owner@example.com", name: "คุณสมชาย (เจ้าของ)" },
  new: { id: "calqc-staff-new", email: "calqc-staff-new@example.com", name: "ครูนิว" },
  boss: { id: "calqc-staff-boss", email: "calqc-staff-boss@example.com", name: "ครูบอส" },
};
const MEMBERSHIPS: { id: string; who: Who; tenantId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, boolean> }[] = [
  { id: "calqc-m-owner-a", who: "owner", tenantId: A, role: "OWNER", unitAccess: ["*"], permissions: {} },
  { id: "calqc-m-owner-b", who: "owner", tenantId: B, role: "OWNER", unitAccess: ["*"], permissions: {} },
  {
    id: "calqc-m-new-a",
    who: "new",
    tenantId: A,
    role: "STAFF",
    unitAccess: [UNIT.dive.id],
    // ไม่มีคีย์บัญชี/เงินเดือน (ข้อสอบ "ไม่มีสิทธิ์บัญชีไม่เห็นใบแจ้งหนี้") · มีคีย์บอร์ด + CRM ของตัวเอง
    permissions: { "ai.chat.send": true, "kanban.card.create": true, "kanban.card.update": true, "crm.contact.read": true, "crm.activity.read": true, "crm.activity.update": true },
  },
  { id: "calqc-m-boss-a", who: "boss", tenantId: A, role: "MANAGER", unitAccess: [UNIT.dive.id, UNIT.ticket.id], permissions: { "ai.chat.send": true } },
  { id: "calqc-m-boss-b", who: "boss", tenantId: B, role: "STAFF", unitAccess: [UNIT.dorm.id], permissions: { "ai.chat.send": true, "dorm.view": true } },
];

// ═══════════════ ร้าน · หน่วย · ระบบ · ผู้ใช้ ═══════════════
async function ensureCore() {
  for (const t of TENANTS) {
    const bySlug = await prisma.tenant.findUnique({ where: { slug: t.slug } });
    if (bySlug && bySlug.id !== t.id) throw new Error(`slug ${t.slug} ถูกร้านอื่นใช้อยู่ (id ${bySlug.id}) — ไม่แตะ หยุด`);
    const row = bySlug ?? (await prisma.tenant.findUnique({ where: { id: t.id } }));
    if (!row) {
      bump(created, "tenant");
      await prisma.tenant.create({ data: { id: t.id, slug: t.slug, name: t.name } });
    } else {
      const d = diff(row, { slug: t.slug, name: t.name, status: "ACTIVE", deleteRequestedAt: null });
      if (has(d)) {
        bump(updated, "tenant");
        await prisma.tenant.update({ where: { id: t.id }, data: d });
      }
    }
  }
  for (const u of Object.values(UNIT)) {
    const clash = await prisma.businessUnit.findUnique({ where: { tenantId_slug: { tenantId: u.tenantId, slug: u.slug } } });
    if (clash && clash.id !== u.id) throw new Error(`หน่วย slug ${u.slug} ของร้าน ${u.tenantId} เป็นแถวอื่น (${clash.id}) — หยุด`);
    await ensure("businessUnit", del(prisma.businessUnit), { ...u, status: "ACTIVE" } satisfies Prisma.BusinessUnitUncheckedCreateInput);
  }
  for (const s of Object.values(SYS)) await ensure("appSystem", del(prisma.appSystem), { ...s, active: true } satisfies Prisma.AppSystemUncheckedCreateInput);
  // ภ.พ.30 แสดงเมื่อ vatRegistered (ค่าเริ่มของตาราง = true) — แถวต่อระบบบัญชี (unique systemId)
  for (const s of [SYS.account, SYS.accountB]) {
    const row = await prisma.accountSettings.findUnique({ where: { systemId: s.id } });
    if (!row) {
      bump(created, "accountSettings");
      await prisma.accountSettings.create({ data: { tenantId: s.tenantId, systemId: s.id, vatRegistered: s.id === SYS.account.id } });
    } else if (row.vatRegistered !== (s.id === SYS.account.id)) {
      bump(updated, "accountSettings");
      await prisma.accountSettings.update({ where: { systemId: s.id }, data: { vatRegistered: s.id === SYS.account.id } });
    }
  }
  for (const u of Object.values(USERS)) {
    const byEmail = await prisma.user.findUnique({ where: { email: u.email } });
    if (byEmail && byEmail.id !== u.id) throw new Error(`อีเมล ${u.email} เป็นของผู้ใช้อื่น (${byEmail.id}) — หยุด`);
    await ensure("user", del(prisma.user), { id: u.id, email: u.email, name: u.name } satisfies Prisma.UserUncheckedCreateInput);
  }
  for (const m of MEMBERSHIPS) {
    const userId = USERS[m.who].id;
    const cur = await prisma.membership.findUnique({ where: { userId_tenantId: { userId, tenantId: m.tenantId } } });
    const want = { role: m.role, unitAccess: m.unitAccess, permissions: m.permissions, acceptedAt: ACCEPTED_AT };
    if (!cur) {
      bump(created, "membership");
      await prisma.membership.create({ data: { id: m.id, userId, tenantId: m.tenantId, invitedAt: ACCEPTED_AT, ...want } });
    } else {
      const d = diff(cur, want);
      if (has(d)) {
        bump(updated, "membership");
        await prisma.membership.update({ where: { id: cur.id }, data: d });
      }
    }
  }
  // สมาชิกภาพนอกสัญญาในร้าน calqc (QC ทดลองเพิ่ม) — ลบ (ร้านของ seed นี้เท่านั้น)
  for (const tenantId of [A, B]) {
    const keep = MEMBERSHIPS.filter((m) => m.tenantId === tenantId).map((m) => USERS[m.who].id);
    bump(removed, "membership", (await prisma.membership.deleteMany({ where: { tenantId, userId: { notIn: keep } } })).count);
  }
}

// ═══════════════ HR + จองคิว (นัด "ของฉัน" ผ่าน BookingStaff → HrEmployee.linkedUserId · R-CAL-5) ═══════════════
const EMP = {
  new: { id: "calqc-emp-new", name: "ครูนิว", linkedUserId: USERS.new.id },
  boss: { id: "calqc-emp-boss", name: "ครูบอส", linkedUserId: USERS.boss.id },
};
const STAFF = {
  new: { id: "calqc-bstaff-new", name: "ครูนิว", employeeId: EMP.new.id as string | null },
  boss: { id: "calqc-bstaff-boss", name: "ครูบอส", employeeId: EMP.boss.id as string | null },
  trainee: { id: "calqc-bstaff-trainee", name: "ครูฝึกหัด (ไม่ผูก HR)", employeeId: null as string | null },
};
const SVC = {
  discover: { id: "calqc-bsvc-discover", name: "Discover Scuba", durationMin: 60 },
  ow: { id: "calqc-bsvc-ow", name: "Open Water ภาคทฤษฎี", durationMin: 120 },
};
const APPTS = [
  { id: "calqc-appt-1", staff: STAFF.new.id, svc: SVC.discover, start: bkk(0, 9, 30), status: "CONFIRMED" as const, customerName: "คุณแพร" }, // ของครูนิว วันนี้
  { id: "calqc-appt-2", staff: STAFF.boss.id, svc: SVC.ow, start: bkk(0, 11, 0), status: "CONFIRMED" as const, customerName: "กลุ่มคุณต้น (3 คน)" }, // ของครูบอส
  { id: "calqc-appt-3", staff: STAFF.new.id, svc: SVC.discover, start: bkk(0, 14, 0), status: "CANCELLED" as const, customerName: "คุณยกเลิก" }, // ต้องไม่แสดง
  { id: "calqc-appt-4", staff: STAFF.trainee.id, svc: SVC.discover, start: bkk(0, 16, 0), status: "CONFIRMED" as const, customerName: "คุณจอย" }, // ผู้จัดการเห็น · ครูนิวไม่เห็น
  { id: "calqc-appt-5", staff: STAFF.new.id, svc: SVC.discover, start: bkk(1, 10, 0), status: "CONFIRMED" as const, customerName: "คุณบี" }, // พรุ่งนี้ (จอ 10)
  { id: "calqc-appt-6", staff: STAFF.new.id, svc: SVC.ow, start: bkk(1, 12, 0), status: "PENDING" as const, customerName: "คุณกานต์" }, // ทับนัดส่วนตัว 12:30 (นัดชน)
];

async function ensureHrBooking() {
  for (const e of Object.values(EMP)) {
    await ensure("hrEmployee", del(prisma.hrEmployee), { ...e, tenantId: A, systemId: SYS.hr.id, active: true } satisfies Prisma.HrEmployeeUncheckedCreateInput);
  }
  for (const [i, s] of Object.values(STAFF).entries()) {
    await ensure("bookingStaff", del(prisma.bookingStaff), { ...s, tenantId: A, unitId: UNIT.dive.id, active: true, sortOrder: i } satisfies Prisma.BookingStaffUncheckedCreateInput);
  }
  for (const s of Object.values(SVC)) {
    await ensure("bookingService", del(prisma.bookingService), { ...s, tenantId: A, unitId: UNIT.dive.id, active: true } satisfies Prisma.BookingServiceUncheckedCreateInput);
  }
  for (const a of APPTS) {
    await ensure("appointment", del(prisma.appointment), {
      id: a.id,
      tenantId: A,
      unitId: UNIT.dive.id,
      staffId: a.staff,
      serviceId: a.svc.id,
      startAt: a.start,
      endAt: new Date(a.start.getTime() + a.svc.durationMin * 60_000),
      status: a.status,
      customerName: a.customerName,
      customerPhone: "0800000000",
    } satisfies Prisma.AppointmentUncheckedCreateInput);
  }
  // เงินเดือน: งวดก่อน PAID (ปกส.>0 → ภ.ง.ด.1/ปกส.) · งวดนี้ APPROVED จ่ายวันที่ 25 (จอ 4)
  await ensure("hrPayrollRun", del(prisma.hrPayrollRun), {
    id: "calqc-payrun-prev", tenantId: A, systemId: SYS.hr.id, periodKey: PERIOD_PREV, payDate: dayOfMonth(-1, 25, 10), status: "PAID",
    totalGrossSatang: 6_000_000, totalSsoEmployeeSatang: 150_000, totalSsoEmployerSatang: 150_000, totalWhtSatang: 20_000, totalNetSatang: 5_830_000,
  } satisfies Prisma.HrPayrollRunUncheckedCreateInput);
  await ensure("hrPayrollRun", del(prisma.hrPayrollRun), {
    id: "calqc-payrun-now", tenantId: A, systemId: SYS.hr.id, periodKey: PERIOD_NOW, payDate: dayOfMonth(0, 25, 10), status: "APPROVED",
    totalGrossSatang: 6_000_000, totalSsoEmployeeSatang: 150_000, totalSsoEmployerSatang: 150_000, totalWhtSatang: 20_000, totalNetSatang: 5_830_000,
  } satisfies Prisma.HrPayrollRunUncheckedCreateInput);
  // ใบลา: ของครูนิว (ครูนิวเห็น) · ของครูบอส (คนอื่นไม่เห็นแม้เป็นเจ้าของ · R-CAL-7)
  await ensure("hrLeave", del(prisma.hrLeave), { id: "calqc-leave-new", tenantId: A, systemId: SYS.hr.id, employeeId: EMP.new.id, type: "VACATION", fromDate: dateOnly(3), toDate: dateOnly(4), status: "APPROVED" } satisfies Prisma.HrLeaveUncheckedCreateInput);
  await ensure("hrLeave", del(prisma.hrLeave), { id: "calqc-leave-boss", tenantId: A, systemId: SYS.hr.id, employeeId: EMP.boss.id, type: "SICK", fromDate: dateOnly(2), toDate: dateOnly(2), status: "PENDING" } satisfies Prisma.HrLeaveUncheckedCreateInput);
}

// ═══════════════ CRM (ownerUserId · ระบบ uiVersion 2) ═══════════════
const CONTACT_EK = "calqc-crm-contact-ek";
async function ensureCrm() {
  await ensure("crmContact", del(prisma.crmContact), { id: CONTACT_EK, tenantId: A, systemId: SYS.crm.id, name: "คุณเอก", phone: "0812344421", ownerUserId: USERS.owner.id } satisfies Prisma.CrmContactUncheckedCreateInput);
  const acts: Prisma.CrmActivityUncheckedCreateInput[] = [
    { id: "calqc-crm-act-call", tenantId: A, systemId: SYS.crm.id, contactId: CONTACT_EK, type: "CALL", title: "โทรติดตามใบเสนอราคาคุณเอก", dueAt: bkk(0, 13, 0), ownerUserId: USERS.new.id, doneAt: null },
    { id: "calqc-crm-act-task", tenantId: A, systemId: SYS.crm.id, contactId: CONTACT_EK, type: "TASK", title: "ส่งรายละเอียดทริปให้คุณเอก", dueAt: bkk(1, 9, 0), ownerUserId: USERS.new.id, doneAt: null },
    { id: "calqc-crm-act-meet", tenantId: A, systemId: SYS.crm.id, contactId: CONTACT_EK, type: "MEETING", title: "ประชุมคุณเอก เรื่องเช่าเรือ ธ.ค.", startAt: bkk(0, 14, 0), endAt: bkk(0, 15, 0), dueAt: null, ownerUserId: USERS.owner.id, doneAt: null },
    { id: "calqc-crm-act-done", tenantId: A, systemId: SYS.crm.id, contactId: CONTACT_EK, type: "TASK", title: "โทรยืนยันมัดจำ (เสร็จแล้ว)", dueAt: bkk(0, 10, 0), ownerUserId: USERS.new.id, doneAt: bkk(0, 10, 5), completedById: USERS.new.id },
  ];
  for (const a of acts) await ensure("crmActivity", del(prisma.crmActivity), a as Row & { id: string });
}

// ═══════════════ บอร์ดงาน (การ์ดของฉัน · ติ๊ก = ย้ายคอลัมน์เสร็จ) ═══════════════
async function ensureKanban() {
  const boards: Prisma.KanbanBoardUncheckedCreateInput[] = [
    { id: "calqc-kb-trip", tenantId: A, systemId: SYS.kanban.id, name: "ทริปสิมิลัน", visibility: "TENANT", status: "ACTIVE", cardNoSeq: 3, createdById: USERS.owner.id },
    { id: "calqc-kb-nodone", tenantId: A, systemId: SYS.kanban.id, name: "งานจิปาถะ (ไม่มีคอลัมน์เสร็จ)", visibility: "TENANT", status: "ACTIVE", cardNoSeq: 1, createdById: USERS.owner.id },
  ];
  for (const b of boards) await ensure("kanbanBoard", del(prisma.kanbanBoard), b as Row & { id: string }, ["cardNoSeq"]);
  const cols: Prisma.KanbanColumnUncheckedCreateInput[] = [
    { id: "calqc-kc-trip-todo", tenantId: A, systemId: SYS.kanban.id, boardId: "calqc-kb-trip", name: "ต้องทำ", sortOrder: 0, isDoneColumn: false },
    { id: "calqc-kc-trip-done", tenantId: A, systemId: SYS.kanban.id, boardId: "calqc-kb-trip", name: "เสร็จ", sortOrder: 1, isDoneColumn: true },
    { id: "calqc-kc-nodone-todo", tenantId: A, systemId: SYS.kanban.id, boardId: "calqc-kb-nodone", name: "ต้องทำ", sortOrder: 0, isDoneColumn: false },
  ];
  for (const c of cols) await ensure("kanbanColumn", del(prisma.kanbanColumn), c as Row & { id: string });
  const cards: Prisma.KanbanCardUncheckedCreateInput[] = [
    { id: "calqc-card-tank", tenantId: A, systemId: SYS.kanban.id, boardId: "calqc-kb-trip", columnId: "calqc-kc-trip-todo", cardNo: 1, title: "เช็กถังอากาศก่อนทริปพรุ่งนี้", assigneeUserId: USERS.new.id, dueAt: bkk(0, 17, 0), status: "ACTIVE", completedAt: null },
    { id: "calqc-card-boat", tenantId: A, systemId: SYS.kanban.id, boardId: "calqc-kb-trip", columnId: "calqc-kc-trip-todo", cardNo: 2, title: "ยืนยันเรือกับท่าเรือ", assigneeUserId: USERS.owner.id, dueAt: bkk(2, 12, 0), status: "ACTIVE", completedAt: null },
    { id: "calqc-card-done", tenantId: A, systemId: SYS.kanban.id, boardId: "calqc-kb-trip", columnId: "calqc-kc-trip-done", cardNo: 3, title: "จองรถรับส่ง (เสร็จแล้ว)", assigneeUserId: USERS.new.id, dueAt: bkk(0, 9, 0), status: "ACTIVE", completedAt: bkk(0, 8, 30) },
    { id: "calqc-card-nodone", tenantId: A, systemId: SYS.kanban.id, boardId: "calqc-kb-nodone", columnId: "calqc-kc-nodone-todo", cardNo: 1, title: "ซื้อน้ำดื่มเข้าร้าน", assigneeUserId: USERS.new.id, dueAt: bkk(0, 18, 0), status: "ACTIVE", completedAt: null },
  ];
  for (const c of cards) await ensure("kanbanCard", del(prisma.kanbanCard), c as Row & { id: string });
  // ผู้รับผิดชอบหลายคน: การ์ดเรือ = เจ้าของ (หลัก) + ครูบอส (รอง ผ่าน KanbanCardAssignee เท่านั้น)
  const assignees = [
    { cardId: "calqc-card-tank", userId: USERS.new.id },
    { cardId: "calqc-card-boat", userId: USERS.owner.id },
    { cardId: "calqc-card-boat", userId: USERS.boss.id },
    { cardId: "calqc-card-done", userId: USERS.new.id },
    { cardId: "calqc-card-nodone", userId: USERS.new.id },
  ];
  for (const a of assignees) {
    const row = await prisma.kanbanCardAssignee.findUnique({ where: { cardId_userId: a } });
    if (!row) {
      bump(created, "kanbanCardAssignee");
      await prisma.kanbanCardAssignee.create({ data: { ...a, tenantId: A, assignedById: USERS.owner.id } });
    }
  }
}

// ═══════════════ บัญชี (แถวสรุปครบกำหนด/เกินกำหนด · WHT เดือนก่อน → ภ.ง.ด.3/53) ═══════════════
async function ensureAccount() {
  const inv = (id: string, docNo: string, name: string, total: number, paid: number, due: Date, status: Prisma.AccountDocumentUncheckedCreateInput["status"]): Prisma.AccountDocumentUncheckedCreateInput => ({
    id, tenantId: A, systemId: SYS.account.id, docType: "INVOICE", docNo, status, direction: "OUT",
    issueDate: bkk(-20, 10), dueDate: due, contactSnapshot: { name }, subTotal: total, grandTotal: total, paidTotal: paid, createdById: USERS.owner.id,
  });
  const docs = [
    inv("calqc-inv-ocean", "CALQC-INV-0312", "Ocean Tour", 1_200_000, 0, bkk(0, 0, 0), "AWAITING_PAYMENT"), // ครบวันนี้ ฿12,000
    inv("calqc-inv-malee", "CALQC-INV-0313", "คุณมาลี", 640_000, 0, bkk(0, 0, 0), "AWAITING_PAYMENT"), // ครบวันนี้ ฿6,400
    inv("calqc-inv-late", "CALQC-INV-0298", "บริษัท ทะเลใส", 900_000, 300_000, bkk(-5, 0, 0), "PARTIAL"), // เกินกำหนด ค้าง ฿6,000
    inv("calqc-inv-paid", "CALQC-INV-0300", "คุณจ่ายแล้ว", 500_000, 500_000, bkk(0, 0, 0), "PAID"), // ต้องไม่นับ
    {
      id: "calqc-wht-prev", tenantId: A, systemId: SYS.account.id, docType: "WHT_CERT", docNo: "CALQC-WHT-0001", status: "ISSUED", direction: "IN",
      issueDate: dayOfMonth(-1, 10, 10), contactSnapshot: { name: "ช่างซ่อมเรือ" }, subTotal: 1_000_000, whtAmount: 30_000, grandTotal: 1_000_000, whtIncomeType: null, whtRateBp: 300,
    } satisfies Prisma.AccountDocumentUncheckedCreateInput,
  ];
  for (const d of docs) await ensure("accountDocument", del(prisma.accountDocument), d as Row & { id: string });
}

// ═══════════════ หอพัก (ร้าน B · แถวสรุปต่อรอบบิล) ═══════════════
async function ensureDorm() {
  await ensure("hotelRoomType", del(prisma.hotelRoomType), { id: "calqc-rt-std", tenantId: B, unitId: UNIT.dorm.id, name: "ห้องมาตรฐาน" } satisfies Prisma.HotelRoomTypeUncheckedCreateInput);
  const rooms = [
    { id: "calqc-room-201", number: "201", party: { id: "calqc-party-201", name: "ผู้เช่าห้อง 201" }, lease: "calqc-lease-201", bill: "calqc-bill-201", paid: true },
    { id: "calqc-room-202", number: "202", party: { id: "calqc-party-202", name: "ผู้เช่าห้อง 202" }, lease: "calqc-lease-202", bill: "calqc-bill-202", paid: false },
  ];
  await ensure("dormBillRun", del(prisma.dormBillRun), {
    id: "calqc-billrun", tenantId: B, unitId: UNIT.dorm.id, periodKey: PERIOD_NOW, status: "SENT", issueDate: dateOnly(-3), dueDate: dateOnly(4), billCount: 2, totalSatang: 700_000, sentAt: bkk(-3, 9),
  } satisfies Prisma.DormBillRunUncheckedCreateInput);
  for (const r of rooms) {
    await ensure("hotelRoom", del(prisma.hotelRoom), { id: r.id, tenantId: B, unitId: UNIT.dorm.id, roomTypeId: "calqc-rt-std", number: r.number } satisfies Prisma.HotelRoomUncheckedCreateInput);
    await ensure("party", del(prisma.party), { id: r.party.id, tenantId: B, name: r.party.name } satisfies Prisma.PartyUncheckedCreateInput);
    await ensure("dormLease", del(prisma.dormLease), {
      id: r.lease, tenantId: B, unitId: UNIT.dorm.id, roomId: r.id, partyId: r.party.id, status: "ACTIVE", startDate: new Date("2026-06-01T00:00:00.000Z"), rentSatang: 350_000,
    } satisfies Prisma.DormLeaseUncheckedCreateInput);
    await ensure("dormBill", del(prisma.dormBill), {
      id: r.bill, tenantId: B, unitId: UNIT.dorm.id, runId: "calqc-billrun", leaseId: r.lease, roomId: r.id, partyId: r.party.id, periodKey: PERIOD_NOW,
      status: r.paid ? "PAID" : "SENT", lines: [], subtotalSatang: 350_000, totalSatang: 350_000, paidSatang: r.paid ? 350_000 : 0, dueDate: dateOnly(4), paidAt: r.paid ? bkk(-1, 12) : null,
    } satisfies Prisma.DormBillUncheckedCreateInput);
  }
}

// ═══════════════ ตั๋ว (TicketEvent · R-CAL-4) ═══════════════
async function ensureTicket() {
  await ensure("ticketEvent", del(prisma.ticketEvent), { id: "calqc-tevent", tenantId: A, unitId: UNIT.ticket.id, name: "ทริปดำน้ำเกาะเต่า (ขายบัตร)", startAt: bkk(1, 7, 0), status: "PUBLISHED" } satisfies Prisma.TicketEventUncheckedCreateInput);
}

// ═══════════════ ของส่วนตัว (CalItem/CalPref · ตรวจตอนรัน — ก่อน CAL1.1 ข้าม) ═══════════════
const CAL_MODELS = ["CalItem", "CalPref"] as const;
function calMissing(): string[] {
  const names = new Set(PrismaNs.dmmf.datamodel.models.map((m) => m.name));
  return CAL_MODELS.filter((m) => !names.has(m) || !(m.charAt(0).toLowerCase() + m.slice(1) in prisma));
}
type CalSeed = { id: string; userId: string; tenantId: string; kind: "REMINDER" | "EVENT"; title: string; startAt: Date; endAt?: Date | null; repeat?: string; repeatDays?: number[]; leadMinutes?: number; status?: string; source?: string; linkType?: string | null; linkId?: string | null; linkSystemId?: string | null; note?: string | null };
const CAL_ITEMS: CalSeed[] = [
  // จอ 3/5/7: เตือนเจ้าของ 15:00 ผูกคุณเอก (สั่งจากแชท)
  { id: "calqc-cal-ek", userId: USERS.owner.id, tenantId: A, kind: "REMINDER", title: "โทรหาคุณเอก เรื่องมัดจำเรือ", startAt: bkk(0, 15, 0), source: "CHAT", linkType: "CRM_CONTACT", linkId: CONTACT_EK, linkSystemId: SYS.crm.id },
  // จอ 5: เตือนประจำทุกวันจันทร์ 09:00
  { id: "calqc-cal-weekly", userId: USERS.owner.id, tenantId: A, kind: "REMINDER", title: "เช็กสต็อกอุปกรณ์", startAt: nextMonday9, repeat: "WEEKLY", repeatDays: [1] },
  // จอ 5: DRAFT รอยืนยัน (เตือนประจำวันที่ 5 ทุกเดือน)
  { id: "calqc-cal-draft", userId: USERS.owner.id, tenantId: A, kind: "REMINDER", title: "จ่ายค่าเช่าท่าเรือ", startAt: dayOfMonth(1, 5, 9), repeat: "MONTHLY", status: "DRAFT", source: "CHAT" },
  // จอ 10: นัดส่วนตัวของเจ้าของพรุ่งนี้ 13:00–14:00 (ทดสอบ TIGHT/นัดชนกับ Google/ในเครื่องฝั่งแอป · ส่งออก Google)
  { id: "calqc-cal-bank", userId: USERS.owner.id, tenantId: A, kind: "EVENT", title: "ประชุมธนาคาร (สินเชื่อเรือ)", startAt: bkk(1, 13, 0), endAt: bkk(1, 14, 0), leadMinutes: 15 },
  // M3: เตือนของครูนิว (เจ้าของห้ามเห็น) — ทับนัดลูกค้า 12:00 ของครูนิวพรุ่งนี้ (นัดชน OVERLAP)
  { id: "calqc-cal-new-event", userId: USERS.new.id, tenantId: A, kind: "EVENT", title: "ไปหาหมอฟัน", startAt: bkk(1, 12, 30), endAt: bkk(1, 13, 30), leadMinutes: 15 },
  { id: "calqc-cal-new", userId: USERS.new.id, tenantId: A, kind: "REMINDER", title: "เติมลมถังสำรอง", startAt: bkk(0, 16, 30) },
  // R-CAL-32: เตือนของเจ้าของในร้าน B (ไม่โผล่ในปฏิทินร้าน A)
  { id: "calqc-cal-owner-b", userId: USERS.owner.id, tenantId: B, kind: "REMINDER", title: "ตรวจมิเตอร์น้ำห้อง 202", startAt: bkk(1, 10, 0) },
  // แท็บ "เสร็จแล้ว"
  { id: "calqc-cal-done", userId: USERS.owner.id, tenantId: A, kind: "REMINDER", title: "โอนค่าน้ำมันเรือ (เสร็จแล้ว)", startAt: bkk(0, 8, 0), status: "DONE" },
];
const CAL_PREFS = [
  { id: "calqc-pref-owner-b", userId: USERS.owner.id, tenantId: B, morningOn: true, morningMinute: 435, eveningOn: false, eveningMinute: 1140, sources: {}, travelMinutes: 0 }, // 07:15 (CAL1.5)
  { id: "calqc-pref-boss-a", userId: USERS.boss.id, tenantId: A, morningOn: true, morningMinute: 480, eveningOn: true, eveningMinute: 1140, sources: { hr: false }, travelMinutes: 45 }, // จอ 8 HR ปิด · จอ 10 เวลาเดินทาง
];

/** ค่าเริ่มของ nextFireAt ตามสัญญา §5.2 แบบย่อ (ตัวจริง = next-fire.ts ของ CAL1.2 · job คำนวณใหม่เองเมื่อแก้) */
function calRow(s: CalSeed): Row & { id: string } {
  const status = s.status ?? "OPEN";
  const lead = s.leadMinutes ?? 0;
  const fire = new Date(s.startAt.getTime() - lead * 60_000);
  const future = s.startAt.getTime() > Date.now();
  return {
    id: s.id, userId: s.userId, tenantId: s.tenantId, kind: s.kind, title: s.title, note: s.note ?? null,
    startAt: s.startAt, endAt: s.endAt ?? null, allDay: false, repeat: s.repeat ?? "NONE", repeatDays: s.repeatDays ?? [], leadMinutes: lead,
    linkType: s.linkType ?? null, linkId: s.linkId ?? null, linkSystemId: s.linkSystemId ?? null,
    status, doneAt: status === "DONE" ? s.startAt : null, occursAt: s.startAt,
    nextFireAt: status === "OPEN" && future ? (fire.getTime() > Date.now() ? fire : new Date(Math.ceil(Date.now() / 60_000) * 60_000)) : null,
    source: s.source ?? "APP", roomId: null,
  };
}

async function ensureCal(): Promise<string> {
  const miss = calMissing();
  if (miss.length) return `TODO(CAL1.1): ยังไม่มีโมเดล ${miss.join(", ")} — ข้าม CalItem ${CAL_ITEMS.length} แถว · CalPref ${CAL_PREFS.length} แถว (รันซ้ำหลัง migration calendar_a)`;
  const items = (prisma as unknown as Record<string, unknown>).calItem as Delegate & { deleteMany(a: unknown): Promise<{ count: number }> };
  const prefs = (prisma as unknown as Record<string, unknown>).calPref as Delegate & { deleteMany(a: unknown): Promise<{ count: number }> };
  // nextFireAt ขึ้นกับนาฬิกา → ใส่ตอนสร้างเท่านั้น (ไม่ให้รันซ้ำเขียนทุกครั้ง) · ช่องอื่นกลับเป็นค่าตามสัญญาเสมอ
  for (const s of CAL_ITEMS) await ensure("calItem", items, calRow(s), ["nextFireAt"]);
  for (const p of CAL_PREFS) await ensure("calPref", prefs, p);
  for (const tenantId of [A, B]) {
    bump(removed, "calItem", (await items.deleteMany({ where: { tenantId, id: { notIn: CAL_ITEMS.map((i) => i.id) } } })).count);
    bump(removed, "calPref", (await prefs.deleteMany({ where: { tenantId, id: { notIn: CAL_PREFS.map((p) => p.id) } } })).count);
  }
  return `NOTE(CAL1.1+): CalItem ${CAL_ITEMS.length} · CalPref ${CAL_PREFS.length} ตรงสัญญา`;
}

// ═══════════════════════════ ลงมือ ═══════════════════════════
await ensureCore();
await ensureHrBooking();
await ensureCrm();
await ensureKanban();
await ensureAccount();
await ensureDorm();
await ensureTicket();
const calNote = await ensureCal();

// ═══════════════ สรุป (รันซ้ำต้องได้ตัวเลขเดิมทุกตัว) ═══════════════
const summary = {
  day: DAY0,
  A: {
    units: await prisma.businessUnit.count({ where: { tenantId: A } }),
    systems: await prisma.appSystem.count({ where: { tenantId: A } }),
    memberships: await prisma.membership.count({ where: { tenantId: A } }),
    appointments: await prisma.appointment.count({ where: { tenantId: A } }),
    crmActivities: await prisma.crmActivity.count({ where: { tenantId: A } }),
    kanbanCards: await prisma.kanbanCard.count({ where: { tenantId: A } }),
    accountDocs: await prisma.accountDocument.count({ where: { tenantId: A } }),
    payrollRuns: await prisma.hrPayrollRun.count({ where: { tenantId: A } }),
    leaves: await prisma.hrLeave.count({ where: { tenantId: A } }),
    ticketEvents: await prisma.ticketEvent.count({ where: { tenantId: A } }),
  },
  B: {
    memberships: await prisma.membership.count({ where: { tenantId: B } }),
    dormBills: await prisma.dormBill.count({ where: { tenantId: B } }),
    dormLeases: await prisma.dormLease.count({ where: { tenantId: B } }),
  },
};
const wrote = has(created) || has(updated) || has(removed);
console.log(calNote);
console.log(`วันอ้างอิง ${DAY0} · ร้าน A: ${JSON.stringify(summary.A)}`);
console.log(`ร้าน B: ${JSON.stringify(summary.B)}`);
console.log(
  wrote
    ? `เขียนรอบนี้: สร้าง ${JSON.stringify(created)} · แก้ ${JSON.stringify(updated)} · ลบ ${JSON.stringify(removed)} · ${Math.round((Date.now() - t0) / 1000)} วิ`
    : `ไม่มีการเขียน (ตรงสัญญาแล้ว) · ${Math.round((Date.now() - t0) / 1000)} วิ`,
);
console.log(`SEED_SUMMARY ${JSON.stringify(summary)}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "seed-calendar-qc", ok: true, created, updated, removed })}`);
await prisma.$disconnect();
